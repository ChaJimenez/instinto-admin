require('dotenv').config();
const FudoClient = require('./fudo-client');

/**
 * Diagnóstico: cómo expone Fudo los modificadores (toppings/extras) por
 * línea de venta, para poder calcular "toppings vendidos por mesero".
 * Prueba varios `include` candidatos contra /sales; si Fudo rechaza uno,
 * su mensaje de error trae la lista real de relaciones válidas (como pasó
 * antes con /products?include=ingredients).
 *
 * Uso: node src/debug-item-modifiers.js
 */

const CANDIDATE_INCLUDES = [
  'items.product,items.itemModifiers,items.modifiers,waiter',
  'items.product,items.saleItemModifiers,waiter',
  'items.product,items.modifierItems,waiter',
];

async function main() {
  const fudo = new FudoClient(
    process.env.FUDO_API_KEY,
    process.env.FUDO_API_SECRET,
    process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1'
  );

  await fudo.authenticate();

  for (const inc of CANDIDATE_INCLUDES) {
    console.log(`\n=== include=${inc} ===`);
    try {
      const res = await fudo.request('GET', `/sales?include=${encodeURIComponent(inc)}&page[size]=1`);
      console.log('OK. included types:', [...new Set((res.included || []).map((i) => i.type))]);
    } catch (err) {
      const detail = err.response?.data?.errors?.[0]?.detail;
      console.log('✗', detail || err.message);
    }
  }

  // También: mirar un ítem crudo completo (attributes + relationships) por
  // si el modificador ya viene inline sin necesitar include.
  console.log('\n=== Ítem crudo de ejemplo (sin include extra) ===');
  const res = await fudo.request('GET', '/sales?include=items.product&page[size]=3');
  const sampleItem = (res.included || []).find((i) => i.type === 'Item' || i.type === 'items');
  console.log(JSON.stringify(sampleItem, null, 2));
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
