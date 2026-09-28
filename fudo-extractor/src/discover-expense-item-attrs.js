require('dotenv').config();
const FudoClient = require('./fudo-client');

/**
 * discover-expense-items.js mostró que ExpenseItem, dentro de "included" de
 * /expenses?include=..., no trae "attributes" (solo relationships a
 * product/ingredient) — no sabemos si es porque el recurso de verdad no
 * tiene cantidad/costo, o porque el include list-level los omite.
 * Esto pide ExpenseItem directo (GET /expenseItems y GET /expenseItems/:id)
 * para ver su forma completa, y también Expense directo con sparse fields
 * por si trae subtotal/total propios (para comparar contra
 * commercialDocument.grandTotal).
 *
 * Uso: node src/discover-expense-item-attrs.js
 */

async function main() {
  const fudo = new FudoClient(
    process.env.FUDO_API_KEY,
    process.env.FUDO_API_SECRET,
    process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1'
  );

  await fudo.authenticate();
  console.log('✅ Autenticado.\n');

  console.log('=== GET /expenseItems (crudo, lista) ===');
  try {
    const response = await fudo.request('GET', '/expenseItems?page[size]=5');
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.log(`✗ Falló (${error.response?.status || error.message})`);
    console.log(JSON.stringify(error.response?.data, null, 2));
  }

  console.log('\n=== GET /expenseItems/1 (crudo, individual) ===');
  try {
    const response = await fudo.request('GET', '/expenseItems/1');
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.log(`✗ Falló (${error.response?.status || error.message})`);
    console.log(JSON.stringify(error.response?.data, null, 2));
  }

  console.log('\n=== GET /expenses/1 (crudo, individual, sin include) ===');
  try {
    const response = await fudo.request('GET', '/expenses/1');
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
