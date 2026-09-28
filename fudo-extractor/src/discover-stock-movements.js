require('dotenv').config();
const FudoClient = require('./fudo-client');

/**
 * Carlos confirmó en la UI de Fudo (app-v2.fu.do/app/#!/expenses y
 * #!/stock_movements) que:
 * - Al registrar un Gasto, captura a mano "Detalle de mercadería":
 *   insumo + cantidad + costo (ExpenseItem SÍ tiene esos datos).
 * - Eso genera un movimiento de stock "Detalle de gasto creado" con
 *   stock anterior/actual/diferencia — visible en Stock > Movimientos de Stock.
 *
 * discover-expense-items.js no mostró attributes en ExpenseItem vía
 * include= — probamos aquí con fields[] (sparse fieldsets JSON:API) y
 * candidatos para el endpoint de movimientos de stock (la ruta del
 * frontend es #!/stock_movements, pero el backend puede llamarse distinto).
 *
 * Uso: node src/discover-stock-movements.js
 */

async function main() {
  const fudo = new FudoClient(
    process.env.FUDO_API_KEY,
    process.env.FUDO_API_SECRET,
    process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1'
  );

  await fudo.authenticate();
  console.log('✅ Autenticado.\n');

  const fieldCandidates = [
    'quantity',
    'quantity,cost',
    'quantity,cost,unitCost',
    'quantity,unitCost,total',
    'quantity,price,cost,total,unit',
  ];

  for (const fields of fieldCandidates) {
    console.log(`=== GET /expenses?include=expenseItems&fields[ExpenseItem]=${fields} ===`);
    try {
      const response = await fudo.request(
        'GET',
        `/expenses?include=expenseItems&fields[ExpenseItem]=${encodeURIComponent(fields)}&page[size]=1`
      );
      const included = (response?.included || []).filter((i) => i.type === 'ExpenseItem');
      console.log(JSON.stringify(included, null, 2));
    } catch (error) {
      console.log(`✗ Falló (${error.response?.status || error.message})`);
      if (error.response?.data) console.log(JSON.stringify(error.response.data).substring(0, 400));
    }
    console.log('');
  }

  const movementPaths = [
    '/stockMovements',
    '/stock_movements',
    '/stock-movements',
    '/ingredientMovements',
    '/ingredientStockMovements',
    '/inventoryMovements',
    '/inventoryEvents',
    '/movements',
    '/events',
  ];

  for (const path of movementPaths) {
    console.log(`=== GET ${path} ===`);
    try {
      const response = await fudo.request('GET', `${path}?page[size]=3`);
      console.log('OK:', JSON.stringify(response).substring(0, 500));
    } catch (error) {
      console.log(`✗ Falló (${error.response?.status || error.message})`);
    }
    console.log('');
  }

  console.log('\n\nListo. Pega toda esta salida en el chat.');
}

main().catch((err) => {
  console.error('Error general:', err.message);
  process.exit(1);
});
