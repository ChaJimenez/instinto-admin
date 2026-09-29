require('dotenv').config();
const FudoClient = require('./fudo-client');
const BasecampIntegration = require('./integrations/basecamp');

/**
 * Concilia gastos capturados en Fudo contra las facturas CFDI que llegan
 * reenviadas a Basecamp Forwards. Diseño completo en RECONCILIACION-FACTURAS.md.
 *
 * Primera versión (deliberadamente conservadora): solo cruza por folio
 * (expense.receiptNumber contra el asunto/cuerpo del forward). No intenta
 * adivinar por proveedor+monto todavía — eso requiere descargar y parsear
 * el XML del CFDI adjunto (folio real, monto, RFC), que no se ha validado
 * contra un forward real. Mejor reportar "sin match" para revisión humana
 * que arriesgar un match falso que oculte un gasto no facturado.
 *
 * Todo lo que no calza con certeza se reporta como excepción — nunca se
 * asume que es un error (ver nota sobre proveedor de respaldo en
 * RECONCILIACION-FACTURAS.md).
 */

// Ventana de tolerancia: una factura puede llegar por correo unos días
// después (o antes, si el proveedor facturó por adelantado) de cuando se
// capturó el gasto en Fudo.
const TOLERANCE_DAYS_BEFORE = 3;
const TOLERANCE_DAYS_AFTER = 7;

function normalize(str) {
  return (str || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Un forward es "candidato a factura" si trae un XML adjunto (CFDI) o si el
 * asunto lo sugiere. Filtra ruido como estados de cuenta de Uber, avisos de
 * Basecamp, etc. que también caen en el mismo inbox de Forwards.
 */
function isLikelyInvoiceForward(forward) {
  const hasXml = (forward.content_attachments || []).some(
    (a) => a.content_type === 'application/xml'
  );
  const subject = (forward.subject || '').toLowerCase();
  return hasXml || subject.includes('factura') || subject.includes('cfdi') || subject.includes('comprobante');
}

function withinToleranceWindow(forwardDate, start, end) {
  const before = new Date(start.getTime() - TOLERANCE_DAYS_BEFORE * 24 * 60 * 60 * 1000);
  const after = new Date(end.getTime() + TOLERANCE_DAYS_AFTER * 24 * 60 * 60 * 1000);
  return forwardDate >= before && forwardDate <= after;
}

/**
 * @param {Date} start
 * @param {Date} end
 * @returns {Promise<{matched: Array, expensesWithoutForward: Array, forwardsWithoutExpense: Array}>}
 */
async function reconcileInvoices(start, end) {
  const fudo = new FudoClient(
    process.env.FUDO_API_KEY,
    process.env.FUDO_API_SECRET,
    process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1'
  );
  const basecamp = new BasecampIntegration();

  const [expenses, forwardsResult] = await Promise.all([
    fudo.getExpenses(start, end),
    basecamp.listForwards(),
  ]);

  const rawMaterialExpenses = expenses.filter(
    (e) => !e.canceled && e.financialCategory === 'GOODS-PURCHASES'
  );

  const candidateForwards = (forwardsResult.data || [])
    .filter((f) => withinToleranceWindow(new Date(f.created_at), start, end))
    .filter(isLikelyInvoiceForward);

  const usedForwardIds = new Set();
  const matched = [];
  const expensesWithoutForward = [];

  for (const expense of rawMaterialExpenses) {
    const folioKey = normalize(expense.receiptNumber);
    let match = null;

    if (folioKey && folioKey.length >= 4) {
      match = candidateForwards.find(
        (f) =>
          !usedForwardIds.has(f.id) &&
          (normalize(f.subject).includes(folioKey) || normalize(f.content).includes(folioKey))
      );
    }

    if (match) {
      usedForwardIds.add(match.id);
      matched.push({
        expenseId: expense.id,
        providerName: expense.providerName,
        amount: expense.amount,
        date: expense.date,
        receiptNumber: expense.receiptNumber,
        forwardId: match.id,
        forwardSubject: match.subject,
        forwardUrl: match.app_url,
      });
    } else {
      expensesWithoutForward.push({
        expenseId: expense.id,
        providerName: expense.providerName,
        amount: expense.amount,
        date: expense.date,
        receiptNumber: expense.receiptNumber,
        hasInvoiceDoc: expense.hasInvoiceDoc,
      });
    }
  }

  const forwardsWithoutExpense = candidateForwards
    .filter((f) => !usedForwardIds.has(f.id))
    .map((f) => ({
      forwardId: f.id,
      subject: f.subject,
      from: f.from,
      createdAt: f.created_at,
      url: f.app_url,
      attachments: (f.content_attachments || []).map((a) => a.filename),
    }));

  return { matched, expensesWithoutForward, forwardsWithoutExpense };
}

module.exports = { reconcileInvoices, normalize, isLikelyInvoiceForward };

if (require.main === module) {
  const [, , cliStart, cliEnd] = process.argv;
  const end = cliEnd ? new Date(`${cliEnd}T23:59:59-06:00`) : new Date();
  const start = cliStart
    ? new Date(`${cliStart}T00:00:00-06:00`)
    : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  reconcileInvoices(start, end)
    .then((result) => {
      console.log(`\n📋 Conciliación de facturas — materia prima, ${start.toISOString().slice(0, 10)} a ${end.toISOString().slice(0, 10)}\n`);

      console.log(`✅ Conciliados por folio (${result.matched.length}):`);
      result.matched.forEach((m) =>
        console.log(`   ${m.date} · ${m.providerName} · $${m.amount} · folio ${m.receiptNumber} → ${m.forwardUrl}`)
      );

      console.log(`\n⚠️  Gastos de materia prima SIN factura de correo encontrada (${result.expensesWithoutForward.length}):`);
      result.expensesWithoutForward.forEach((e) =>
        console.log(`   ${e.date} · ${e.providerName} · $${e.amount} · folio ${e.receiptNumber || 'sin folio'}${e.hasInvoiceDoc ? ' (sí tiene adjunto en Fudo)' : ''}`)
      );

      console.log(`\n🔴 Facturas de correo SIN gasto en Fudo encontrado (${result.forwardsWithoutExpense.length}):`);
      result.forwardsWithoutExpense.forEach((f) =>
        console.log(`   ${f.createdAt} · ${f.from} · "${f.subject}" → ${f.url}`)
      );

      console.log(`\nNota: el match es solo por folio (conservador a propósito). Si "sin factura encontrada" y "sin gasto encontrado" tienen casos que en realidad sí son el mismo, es señal de que el formato de folio de Fudo no coincide textualmente con el del correo — hay que ver un par de ejemplos reales para ajustar el matching.`);
    })
    .catch((err) => {
      console.error('❌ Error en conciliación:', err.message);
      process.exit(1);
    });
}
