require('dotenv').config();
const FudoClient = require('./fudo-client');

/**
 * /stock-movements (con guion) existe (confirmado por discover-stock-
 * movements.js — /stockMovements y /stock_movements dan 404, pero
 * /stock-movements no). Esto trae el detalle crudo y prueba includes
 * para ver su relación con Ingredient/Expense y sus atributos
 * (cantidad anterior/actual/diferencia, fecha, tipo de evento) — eso es
 * la "entrega recibida" real que vimos en la UI (Stock > Movimientos de
 * Stock > "Detalle de gasto creado").
 *
 * Uso: node src/discover-stock-movements-detail.js
 */

async function main() {
  const fudo = new FudoClient(
    process.env.FUDO_API_KEY,
    process.env.FUDO_API_SECRET,
    process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1'
  );

  await fudo.authenticate();
  console.log('✅ Autenticado.\n');

  console.log('=== GET /stock-movements (crudo, sin include) ===');
  try {
    const response = await fudo.request('GET', '/stock-movements?page[size]=5');
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.log(`✗ Falló (${error.response?.status || error.message})`);
  }

  // Provocar el 400 a propósito para que el mensaje de error liste los
  // includes válidos (mismo truco que reveló expenseItems.ingredient antes).
  console.log('\n=== GET /stock-movements?include=bogus (para listar includes válidos) ===');
  try {
    await fudo.request('GET', '/stock-movements?include=bogus&page[size]=1');
  } catch (error) {
    console.log(JSON.stringify(error.response?.data, null, 2));
  }

  const includeCandidates = ['ingredient', 'expense', 'provider', 'ingredient,expense'];
  for (const inc of includeCandidates) {
    console.log(`\n=== GET /stock-movements?include=${inc} ===`);
    try {
      const response = await fudo.request('GET', `/stock-movements?include=${inc}&page[size]=3`);
      console.log(JSON.stringify(response, null, 2));
    } catch (error) {
      console.log(`✗ Falló (${error.response?.status || error.message})`);
      console.log(JSON.stringify(error.response?.data).substring(0, 500));
    }
  }

  console.log('\n\nListo. Pega toda esta salida en el chat.');
}

main().catch((err) => {
  console.error('Error general:', err.message);
  process.exit(1);
});
