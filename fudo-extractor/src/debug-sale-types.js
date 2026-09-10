require('dotenv').config();
const FudoClient = require('./fudo-client');

/**
 * Diagnóstico: qué valores trae `saleType` para las ventas sin mesero
 * asignado, para ver si se pueden desglosar por canal (mostrador, delivery,
 * Uber, etc.) en vez de agruparlas todas como "Sin asignar".
 *
 * Uso: node src/debug-sale-types.js
 */

async function main() {
  const fudo = new FudoClient(
    process.env.FUDO_API_KEY,
    process.env.FUDO_API_SECRET,
    process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1'
  );

  const target = new Date('2026-09-09T12:00:00-06:00');
  const sales = await fudo.getSales(target, target);

  console.log('Todos los saleType distintos del día:', [...new Set(sales.map((s) => s.saleType))]);
  console.log('\nVentas SIN mesero asignado:');
  sales
    .filter((s) => s.waiterName === 'Sin asignar')
    .forEach((s) => console.log(`  id=${s.id} saleType=${s.saleType} saleState=${s.saleState} total=${s.total}`));
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
