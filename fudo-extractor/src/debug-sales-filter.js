require('dotenv').config();
const FudoClient = require('./fudo-client');

/**
 * Diagnóstico: por qué getSales() del 9 de septiembre trae solo 9 de 18
 * ventas reales (confirmadas contra la UI de Fudo). Imprime CADA venta
 * cruda que devuelve /sales en la ventana con colchón, con su
 * createdAt/closedAt tal cual vienen de la API y el día local calculado,
 * para ver exactamente dónde se corta el filtro.
 *
 * Uso: node src/debug-sales-filter.js
 */

async function main() {
  const fudo = new FudoClient(
    process.env.FUDO_API_KEY,
    process.env.FUDO_API_SECRET,
    process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1'
  );

  const target = new Date('2026-09-09T12:00:00-06:00'); // mediodía CDMX del 9 de sept, fecha fija para no depender de "ahora"

  const localStart = fudo.formatDate(target);
  const localEnd = fudo.formatDate(target);
  const queryStart = fudo.formatDate(new Date(target.getTime() - 24 * 60 * 60 * 1000));
  const queryEnd = fudo.formatDate(new Date(target.getTime() + 48 * 60 * 60 * 1000)); // ver comentario en fudo-client.getSales() sobre por qué +2 días

  console.log('Target local day:', localStart);
  console.log('Query window (server filter):', queryStart, '->', queryEnd);

  const filter = encodeURIComponent(`and(gte.${queryStart},lte.${queryEnd})`);
  const path = `/sales?filter[createdAt]=${filter}&include=items.product,waiter,payments,tips`;

  const { data } = await fudo.fetchAllPages(path);
  console.log(`\nTotal ventas crudas devueltas por la API en la ventana: ${data.length}\n`);

  const rows = data
    .map((sale) => {
      const a = sale.attributes || {};
      const day = fudo.localDateOf(a.closedAt || a.createdAt);
      const included = day !== null && day >= localStart && day <= localEnd;
      return {
        id: sale.id,
        createdAt: a.createdAt,
        closedAt: a.closedAt,
        saleState: a.saleState,
        total: a.total,
        computedDay: day,
        included,
      };
    })
    .sort((x, y) => (x.createdAt || '').localeCompare(y.createdAt || ''));

  rows.forEach((r) => {
    console.log(
      `${r.included ? '✅' : '❌'} id=${r.id} state=${r.saleState} total=${r.total} ` +
      `createdAt=${r.createdAt} closedAt=${r.closedAt} -> día=${r.computedDay}`
    );
  });

  const includedCount = rows.filter((r) => r.included).length;
  console.log(`\nIncluidas: ${includedCount} / ${rows.length}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
