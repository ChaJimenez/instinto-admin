const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

/**
 * Publica reportes de Instinto en Basecamp usando el CLI `basecamp` que ya
 * está autenticado en esta máquina (mismo que usan los skills del ecosistema).
 * No mantenemos un cliente HTTP/OAuth propio: reutilizamos esa sesión.
 *
 * Proyecto "Administración" (bucket 32427345, Message Board 6062062956) —
 * confirmado por Carlos el 2026-09-10, reemplaza al proyecto viejo
 * "Operaciones Instinto" (46274090) para reportes/mensajes. Todo lo
 * automático de cortes va ahí ahora.
 * Hilo fijo de cortes diarios creado a mano por Carlos:
 * https://3.basecamp.com/5484659/buckets/32427345/messages/10289129219
 * (id 10289129219) — updateDailyMessage() le prepende el corte del día.
 *
 * EXCEPCIÓN: los forwards de facturas de proveedores SÍ siguen viviendo en
 * el proyecto viejo "Operaciones Instinto" (46274090) — es donde Carlos las
 * revisa todos los días — así que listForwards()/getForward() apuntan a
 * ese bucket distinto vía BASECAMP_FORWARDS_BUCKET_ID/_INBOX_ID.
 */
class BasecampIntegration {
  constructor(config = {}) {
    this.accountId = config.accountId || process.env.BASECAMP_ACCOUNT_ID;
    this.bucketId = config.bucketId || process.env.BASECAMP_BUCKET_ID || '32427345';
    this.messageBoardId = config.messageBoardId || process.env.BASECAMP_MESSAGE_BOARD_ID || '6062062956';
    this.dailyMessageId = config.dailyMessageId || process.env.BASECAMP_MESSAGE_ID || '10289129219';
    this.inventoryMessageId = config.inventoryMessageId || process.env.BASECAMP_INVENTORY_MESSAGE_ID || '10289204960';
    // Hilo fijo para los reportes semanales, confirmado por Carlos:
    // https://3.basecamp.com/5484659/buckets/32427345/messages/10289153902
    this.weeklyMessageId = config.weeklyMessageId || process.env.BASECAMP_WEEKLY_MESSAGE_ID || '10289153902';
    // Los forwards de facturas viven en el proyecto viejo "Operaciones
    // Instinto" (bucket distinto al de "Administración" de arriba) —
    // confirmado por Carlos con el link a la herramienta Forwards de ese
    // proyecto. Por eso van en su propio bucket/inbox, no en this.bucketId.
    this.forwardsBucketId = config.forwardsBucketId || process.env.BASECAMP_FORWARDS_BUCKET_ID;
    this.forwardsInboxId = config.forwardsInboxId || process.env.BASECAMP_FORWARDS_INBOX_ID;
  }

  async run(args) {
    const { stdout } = await execFileAsync('basecamp', [
      ...args,
      '--account', this.accountId,
      '--project', this.bucketId,
      '--json',
    ]);
    return JSON.parse(stdout);
  }

  /**
   * Lista los forwards (facturas/notas reenviadas por correo) del inbox de
   * "Operaciones Instinto", usando el CLI `basecamp forwards list` (subcomando
   * confirmado en la spec oficial de basecamp/basecamp-cli — no probado en
   * vivo desde este contenedor porque el CLI no está instalado aquí, solo
   * en la máquina de Carlos; validar ahí antes de confiar en el parseo).
   */
  async listForwards({ all = true } = {}) {
    if (!this.forwardsBucketId || !this.forwardsInboxId) {
      throw new Error(
        'Falta BASECAMP_FORWARDS_BUCKET_ID / BASECAMP_FORWARDS_INBOX_ID en .env'
      );
    }
    const args = [
      'forwards', 'list',
      '--account', this.accountId,
      '--project', this.forwardsBucketId,
      '--inbox', this.forwardsInboxId,
      '--json',
    ];
    if (all) args.push('--all');
    const { stdout } = await execFileAsync('basecamp', args);
    return JSON.parse(stdout);
  }

  /**
   * Detalle de un forward puntual (asunto, cuerpo, adjuntos) por su ID.
   */
  async getForward(forwardId) {
    const { stdout } = await execFileAsync('basecamp', [
      'forwards', 'show', String(forwardId),
      '--account', this.accountId,
      '--project', this.forwardsBucketId,
      '--json',
    ]);
    return JSON.parse(stdout);
  }

  /**
   * Actualiza el mensaje mensual fijo prependiendo el corte del día.
   * Si no hay BASECAMP_MESSAGE_ID configurado, no hace nada (evita crear
   * mensajes duplicados por accidente).
   */
  async updateDailyMessage(metrics, extra = {}) {
    if (!this.dailyMessageId) {
      console.warn('⚠️  BASECAMP_MESSAGE_ID no configurado — no se actualiza Basecamp.');
      return null;
    }

    const current = await this.run([
      'messages', 'show', this.dailyMessageId,
      '--message-board', this.messageBoardId,
    ]);
    const subject = current.data?.subject || current.subject || '(sin asunto)';
    console.log(`   → Actualizando mensaje ${this.dailyMessageId} en bucket ${this.bucketId}: "${subject}"`);
    const previousContent = current.data?.content || current.content || '';

    const todayBlock = this.formatDailyBlockHTML(metrics, extra);
    const newContent = todayBlock + '<hr>' + previousContent;

    const result = await this.run([
      'messages', 'update', this.dailyMessageId,
      '--message-board', this.messageBoardId,
      '--body', newContent,
    ]);

    console.log(`✅ Corte del día agregado a Basecamp (mensaje ${this.dailyMessageId})`);
    return result;
  }

  /**
   * Actualiza el mensaje fijo de inventario prependiendo las alertas del día.
   * Mismo patrón que updateDailyMessage: un hilo fijo, se le agrega arriba
   * cada corte. Si no hay nada que alertar ese día, igual se agrega un
   * bloque corto confirmando que se revisó (para no dejar duda de si corrió).
   */
  async updateInventoryMessage(lowStockResult, dateLabel) {
    if (!this.inventoryMessageId) {
      console.warn('⚠️  BASECAMP_INVENTORY_MESSAGE_ID no configurado — no se actualiza el reporte de inventario.');
      return null;
    }

    const current = await this.run([
      'messages', 'show', this.inventoryMessageId,
      '--message-board', this.messageBoardId,
    ]);
    const previousContent = current.data?.content || current.content || '';

    const todayBlock = this.formatInventoryBlockHTML(lowStockResult, dateLabel);
    const newContent = todayBlock + '<hr>' + previousContent;

    const result = await this.run([
      'messages', 'update', this.inventoryMessageId,
      '--message-board', this.messageBoardId,
      '--body', newContent,
    ]);

    console.log(`✅ Alertas de inventario agregadas a Basecamp (mensaje ${this.inventoryMessageId})`);
    return result;
  }

  formatInventoryBlockHTML(lowStockResult, dateLabel) {
    const { negative, low, missingThreshold } = lowStockResult;

    if (negative.length === 0 && low.length === 0) {
      return `<p><strong>📦 ${dateLabel}</strong> — sin alertas de stock.</p>`;
    }

    let html = `<p><strong>📦 ${dateLabel}</strong></p>`;

    if (negative.length > 0) {
      const rows = negative
        .map((i) => `<li><strong>${i.name}</strong>: ${i.stock} (inventario en negativo — revisar conteo)</li>`)
        .join('');
      html += `<p style="color:#ef4444;"><strong>🔴 Inventario roto (stock negativo):</strong></p><ul>${rows}</ul>`;
    }

    if (low.length > 0) {
      const rows = low
        .map((i) => `<li><strong>${i.name}</strong>: ${i.stock} (mínimo: ${i.minStock})</li>`)
        .join('');
      html += `<p style="color:#f59e0b;"><strong>🟡 Bajo stock:</strong></p><ul>${rows}</ul>`;
    }

    if (missingThreshold.length > 0) {
      html += `<p><small>${missingThreshold.length} insumo(s) con control de stock activo pero sin "Stock mínimo" configurado — no se pueden evaluar.</small></p>`;
    }

    return html;
  }

  /**
   * Actualiza el hilo fijo de reportes semanales prependiendo el corte de la
   * semana — mismo patrón que updateDailyMessage/updateInventoryMessage, en
   * vez de crear un mensaje nuevo cada lunes, así el historial semana a
   * semana queda en un solo hilo (confirmado por Carlos con el link al
   * mensaje 10289153902).
   */
  async postWeeklyMessage(metrics, dailyBreakdown = null, expensesReport = null, comparison = null) {
    if (!this.weeklyMessageId) {
      console.warn('⚠️  BASECAMP_WEEKLY_MESSAGE_ID no configurado — no se actualiza Basecamp.');
      return null;
    }

    const current = await this.run([
      'messages', 'show', this.weeklyMessageId,
      '--message-board', this.messageBoardId,
    ]);
    const previousContent = current.data?.content || current.content || '';

    const weekBlock = this.formatWeeklyHTML(metrics, dailyBreakdown, expensesReport, comparison);
    const newContent = weekBlock + '<hr>' + previousContent;

    const result = await this.run([
      'messages', 'update', this.weeklyMessageId,
      '--message-board', this.messageBoardId,
      '--body', newContent,
    ]);

    console.log(`✅ Reporte semanal agregado a Basecamp (mensaje ${this.weeklyMessageId})`);
    return result;
  }

  formatDailyBlockHTML(metrics, extra = {}) {
    const { kpis, period } = metrics;
    const { topProducts = [], waiterPerformance = [], channelPerformance = [], toppingsByWaiter = [], salesByHour = [], tipsTotal = 0, peopleTotal = 0, previousDay = null } = extra;

    const cogsLine = kpis.cogsPercentage === null
      ? '<em>COGS: sin datos de costo cargados en Fudo</em>'
      : `COGS: ${kpis.cogsPercentage}%`;

    const comparisonLine = this.formatComparisonLine(kpis, previousDay);

    let hourHTML = '';
    if (salesByHour.length > 0) {
      const peakHour = salesByHour.reduce((max, h) => (h.total > max.total ? h : max), salesByHour[0]);
      const rows = salesByHour
        .map((h) => {
          const label = `${String(h.hour).padStart(2, '0')}:00–${String((h.hour + 1) % 24).padStart(2, '0')}:00`;
          const peakMark = h.hour === peakHour.hour ? ' 🔥' : '';
          return `<li>${label}: $${h.total.toLocaleString('es-MX')} (${h.count} ticket${h.count === 1 ? '' : 's'})${peakMark}</li>`;
        })
        .join('');
      hourHTML = `<p><strong>Ventas por hora</strong> (🔥 hora pico):</p><ul>${rows}</ul>`;
    }

    let productsHTML = '';
    if (topProducts.length > 0) {
      const rows = topProducts
        .map((p) => `<li>${p.name}: ${p.quantity} uds · $${p.revenue.toLocaleString('es-MX')}</li>`)
        .join('');
      productsHTML = `<p><strong>Top 5 productos:</strong></p><ul>${rows}</ul>`;
    }

    let waiterHTML = '';
    if (waiterPerformance.length > 0) {
      const rows = waiterPerformance
        .map((w) => {
          const cancelText = w.cancelRate > 0 ? ` · cancelaciones ${w.cancelRate}%` : '';
          return `<li>${w.name}: ${w.tickets} tickets · $${w.totalSales.toLocaleString('es-MX')} · promedio $${w.avgTicket.toFixed(2)}${cancelText}</li>`;
        })
        .join('');
      waiterHTML = `<p><strong>Por mesero:</strong></p><ul>${rows}</ul>`;
    }

    // Aparte de "por mesero": mostrador/domicilio/Uber no tienen mesero por
    // diseño, no es un dato faltante — compararlas contra un mesero real
    // como si fuera una persona más no tiene sentido.
    let channelHTML = '';
    if (channelPerformance.length > 0) {
      const rows = channelPerformance
        .map((c) => `<li>${c.label}: ${c.tickets} tickets · $${c.totalSales.toLocaleString('es-MX')}</li>`)
        .join('');
      channelHTML = `<p><strong>Ventas sin mesero (por canal):</strong></p><ul>${rows}</ul>`;
    }

    // Toppings/extras vendidos como "subitem" en Fudo (no hay concepto de
    // "modificador" expuesto por la API) — attachment rate: % de tickets de
    // ese mesero que llevaron al menos un topping.
    let toppingsHTML = '';
    if (toppingsByWaiter.length > 0) {
      const rows = toppingsByWaiter
        .map((w) => `<li>${w.name}: ${w.attachmentRate}% de tickets con extra · ${w.toppingsQty} extra(s) · $${w.toppingsRevenue.toLocaleString('es-MX')}</li>`)
        .join('');
      if (rows) {
        toppingsHTML = `<p><strong>Toppings/extras por mesero:</strong></p><ul>${rows}</ul>`;
      }
    }

    const tipsLine = tipsTotal > 0 ? `<p>Propinas: $${tipsTotal.toLocaleString('es-MX')}</p>` : '';
    // Tickets = conteo de órdenes; Personas = comensales reales (sale.people).
    // No son lo mismo — Fudo mismo los distingue en su propia UI.
    const peopleText = peopleTotal > 0 ? ` · Personas: ${peopleTotal}` : '';
    const revpashLine = kpis.revpash ? `<p><small>RevPASH: $${kpis.revpash}</small></p>` : '';

    return `
      <p><strong>📅 ${period.end}</strong></p>
      <p>Ventas: $${kpis.grossSales.toLocaleString('es-MX')} · Tickets: ${kpis.covers}${peopleText} · Ticket promedio: $${kpis.averageCheck}</p>
      ${comparisonLine}
      <p>${cogsLine}</p>
      ${revpashLine}
      ${tipsLine}
      ${hourHTML}
      ${productsHTML}
      ${waiterHTML}
      ${toppingsHTML}
      ${channelHTML}
    `;
  }

  /**
   * "vs. ayer" — la comparación día a día es lo primero que un gerente de
   * restaurante quiere ver en un corte diario, más que el número absoluto.
   * Se omite si no hay datos guardados del día anterior (primera corrida).
   */
  formatComparisonLine(kpis, previousDay) {
    if (!previousDay || !previousDay.grossSales) return '';
    const deltaSales = ((kpis.grossSales - previousDay.grossSales) / previousDay.grossSales) * 100;
    const deltaCovers = previousDay.covers
      ? ((kpis.covers - previousDay.covers) / previousDay.covers) * 100
      : null;
    const arrow = (n) => (n >= 0 ? '▲' : '▼');
    const color = (n) => (n >= 0 ? '#16a34a' : '#ef4444');

    const coversText = deltaCovers === null
      ? ''
      : ` · Tickets <span style="color:${color(deltaCovers)};">${arrow(deltaCovers)} ${Math.abs(deltaCovers).toFixed(1)}%</span>`;

    return `<p><small>vs. ${previousDay.date}: <span style="color:${color(deltaSales)};">${arrow(deltaSales)} ${Math.abs(deltaSales).toFixed(1)}%</span> en ventas${coversText}</small></p>`;
  }

  /**
   * Sección de gastos (compras a proveedores/materia prima) del reporte
   * semanal, a partir de FudoClient.organizeExpenses(). "Vencido sin pagar"
   * es la alerta real (riesgo financiero, va primero y en rojo). "Sin
   * factura adjunta" NO es necesariamente un error — Carlos confirmó que a
   * veces compra a un proveedor de respaldo que no da factura — así que va
   * como nota informativa al final, sin color de alerta, solo para que la
   * revise caso por caso.
   */
  formatExpensesHTML(expensesReport) {
    if (!expensesReport) return '';
    const { rawMaterials, otherExpenses, alerts } = expensesReport;

    const providerRows = (byProvider) =>
      byProvider
        .map((p) => `<li>${p.providerName}: $${p.total.toLocaleString('es-MX')} (${p.count} factura${p.count === 1 ? '' : 's'})</li>`)
        .join('');

    let html = `<h3>🧾 Gastos de la semana</h3>`;
    html += `<p><strong>Materia prima (pan, carne, pollo, etc.):</strong> $${rawMaterials.total.toLocaleString('es-MX')} · ${rawMaterials.count} factura(s)</p>`;
    if (rawMaterials.byProvider.length > 0) {
      html += `<ul>${providerRows(rawMaterials.byProvider)}</ul>`;
    }
    html += `<p><strong>Otros gastos (admin/operativos):</strong> $${otherExpenses.total.toLocaleString('es-MX')} · ${otherExpenses.count} factura(s)</p>`;

    if (alerts.overdueUnpaid.length > 0) {
      const rows = alerts.overdueUnpaid
        .map((e) => `<li>${e.providerName} · $${e.amount.toLocaleString('es-MX')} · vencía ${e.dueDate}</li>`)
        .join('');
      html += `<p style="color:#ef4444;"><strong>🔴 Vencidos sin pagar (${alerts.overdueUnpaid.length}):</strong></p><ul>${rows}</ul>`;
    }

    if (alerts.missingInvoice.length > 0) {
      const rows = alerts.missingInvoice
        .map((e) => `<li>${e.date} · ${e.providerName} · $${e.amount.toLocaleString('es-MX')}${e.description ? ` — ${e.description}` : ''}</li>`)
        .join('');
      html += `<p><small><strong>Sin factura/nota adjunta en Fudo (${alerts.missingInvoice.length})</strong> — revisar si aplica (proveedor de respaldo, etc.) o falta adjuntarla:</small></p><ul><small>${rows}</small></ul>`;
    }

    return html;
  }

  formatWeeklyHTML(metrics, dailyBreakdown = null, expensesReport = null, comparison = null) {
    const { kpis, health, alerts, period } = metrics;

    let dailyHTML = '';
    if (dailyBreakdown && dailyBreakdown.length > 0) {
      const rows = dailyBreakdown.map((d) => `
        <tr>
          <td>${d.date}</td>
          <td>$${d.grossSales.toLocaleString('es-MX')}</td>
          <td>${d.covers}</td>
          <td>$${d.avgTicket}</td>
        </tr>
      `).join('');

      dailyHTML = `
        <p><strong>Ventas por día:</strong></p>
        <table>
          <thead><tr><th>Día</th><th>Ventas</th><th>Tickets</th><th>Ticket promedio</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <hr>
      `;
    }

    let alertsHTML = '';
    if (alerts.length > 0) {
      alertsHTML = `
        <p><strong style="color:#ef4444;">⚠️ Alertas:</strong></p>
        <ul>${alerts.map((a) => `<li><strong>${a.metric}:</strong> ${a.message} → ${a.action}</li>`).join('')}</ul>
      `;
    }

    const cogsText = kpis.cogsPercentage === null
      ? 'sin datos (falta cargar costo por producto en Fudo)'
      : `${kpis.cogsPercentage}% (target 28-32%) ${health.cogsPercentage?.status === 'healthy' || health.cogsPercentage?.status === 'good' ? '✓' : '⚠️'}`;

    const laborText = kpis.laborPercentage === null
      ? 'sin datos (falta costo de nómina del período)'
      : `${kpis.laborPercentage}% (target 20-28%) ${health.laborPercentage?.status === 'healthy' ? '✓' : '⚠️'}`;

    const primeCostStatusIcon = { good: '✓', healthy: '✓', warning: '⚠️', alert: '🔴', no_data: '' };
    const primeCostText = kpis.primeCostPercentage === null
      ? 'sin datos (falta COGS % o labor % del período)'
      : `${kpis.primeCostPercentage}% (target 55-60%) ${primeCostStatusIcon[health.primeCostPercentage?.status] || ''}`;

    return `
      <h3>📊 Reporte Instinto — ${period.start} al ${period.end}</h3>
      <p><strong>Ventas Brutas:</strong> $${kpis.grossSales.toLocaleString('es-MX')}</p>
      <p><strong>Número de Tickets:</strong> ${kpis.covers}</p>
      <p><strong>Ticket Promedio:</strong> $${kpis.averageCheck}</p>
      <hr>
      ${dailyHTML}
      <p><strong>COGS %:</strong> ${cogsText}</p>
      <p><strong>Labor %:</strong> ${laborText}</p>
      <p><strong>Prime Cost %:</strong> ${primeCostText}</p>
      ${this.formatComparisonHTML(comparison)}
      ${alertsHTML}
      <hr>
      ${this.formatExpensesHTML(expensesReport)}
      <p><small>Generado automáticamente por Instinto POS Dashboard</small></p>
    `;
  }

  /**
   * Compara la semana actual contra las 4 referencias que recomienda la
   * industria para separar ruido estacional de tendencia real: semana
   * anterior, promedio móvil de 4 semanas, mismo periodo del año pasado.
   * Ver KPICalculator.calculateHistoricalComparison.
   */
  formatComparisonHTML(comparison) {
    if (!comparison) return '';

    const arrow = (delta) => (delta === null || delta === undefined ? '' : delta > 0 ? '🔺' : delta < 0 ? '🔻' : '➡️');
    const pp = (delta) => (delta === null || delta === undefined ? 'sin datos' : `${delta > 0 ? '+' : ''}${delta}pp`);
    const money = (delta) =>
      delta === null || delta === undefined
        ? 'sin datos'
        : `${delta > 0 ? '+' : ''}$${Math.abs(delta).toLocaleString('es-MX')}`;

    const rows = [];

    if (comparison.previousWeek) {
      rows.push(
        `<li><strong>vs. semana anterior (${comparison.previousWeek.weekStart}):</strong> ventas ${money(comparison.previousWeek.grossSalesDelta)} · prime cost ${arrow(comparison.previousWeek.primeCostPercentageDelta)} ${pp(comparison.previousWeek.primeCostPercentageDelta)}</li>`
      );
    }

    if (comparison.fourWeekAvg) {
      const { avgPrimeCostPercentage, avgGrossSales, weeksIncluded } = comparison.fourWeekAvg;
      rows.push(
        `<li><strong>Promedio móvil ${weeksIncluded} semana(s):</strong> ventas $${avgGrossSales?.toLocaleString('es-MX') ?? 'sin datos'} · prime cost ${avgPrimeCostPercentage ?? 'sin datos'}%</li>`
      );
    }

    if (comparison.sameWeekLastYear) {
      rows.push(
        `<li><strong>vs. mismo periodo año pasado (${comparison.sameWeekLastYear.weekStart}):</strong> ventas ${money(comparison.sameWeekLastYear.grossSalesDelta)} · prime cost ${arrow(comparison.sameWeekLastYear.primeCostPercentageDelta)} ${pp(comparison.sameWeekLastYear.primeCostPercentageDelta)}</li>`
      );
    }

    if (rows.length === 0) return '<p><small>Sin histórico suficiente todavía para comparar (se acumula semana a semana).</small></p>';

    return `<p><strong>📈 Comparación:</strong></p><ul>${rows.join('')}</ul>`;
  }
}

module.exports = BasecampIntegration;
