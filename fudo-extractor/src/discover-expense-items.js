require('dotenv').config();
const FudoClient = require('./fudo-client');

/**
 * Tercera pasada: el 400 de include=ingredient reveló el árbol de includes
 * válido para /expenses (visible en el mensaje de error de discover-
 * expenses-detail.js): expenseItems, expenseItems.product,
 * expenseItems.product.unit, expenseItems.ingredient,
 * expenseItems.ingredient.unit, payments, payments.payment...
 *
 * Esto trae el detalle línea-por-línea (insumo + cantidad) de un gasto real,
 * más expenseCategory y commercialDocument (probable folio/fecha de factura).
 *
 * Uso: node src/discover-expense-items.js
 */

async function main() {
  const fudo = new FudoClient(
    process.env.FUDO_API_KEY,
    process.env.FUDO_API_SECRET,
    process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1'
  );

  await fudo.authenticate();
  console.log('✅ Autenticado.\n');

  const include = [
    'provider',
    'expenseCategory',
    'commercialDocument',
    'expenseItems',
    'expenseItems.product',
    'expenseItems.product.unit',
    'expenseItems.ingredient',
    'expenseItems.ingredient.unit',
  ].join(',');

  console.log(`=== GET /expenses?include=${include} ===\n`);
  try {
    const response = await fudo.request('GET', `/expenses?include=${include}&page[size]=5`);
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.log(`✗ Falló (${error.response?.status || error.message})`);
    console.log(JSON.stringify(error.response?.data, null, 2));
  }

  console.log('\n\nListo. Pega toda esta salida en el chat.');
}

main().catch((err) => {
  console.error('Error general:', err.message);
  process.exit(1);
});
