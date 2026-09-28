require('dotenv').config();
const FudoClient = require('./fudo-client');

/**
 * Script de descubrimiento: prueba endpoints candidatos para compras/
 * proveedores/facturas y vuelca los atributos reales que devuelve Fudo.
 * Mismo patrón que discover-ingredients.js (ese confirmó /ingredients contra
 * /supplies, /stocks, /inventories). Correr una vez para confirmar el path
 * exacto antes de construir la conciliación factura-vs-entrega en serio.
 *
 * Uso: node src/discover-purchases.js
 */

const CANDIDATE_PATHS = [
  '/purchases',
  '/purchaseOrders',
  '/providers',
  '/suppliers',
  '/expenses',
  '/invoices',
  '/bills',
  '/currentAccounts',
  '/currentAccountMovements',
  '/deliveries',
  '/remitos',
  '/stockMovements',
  '/ingredientMovements',
];

async function main() {
  const fudo = new FudoClient(
    process.env.FUDO_API_KEY,
    process.env.FUDO_API_SECRET,
    process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1'
  );

  await fudo.authenticate();
  console.log('✅ Autenticado.\n');

  for (const path of CANDIDATE_PATHS) {
    console.log(`\n=== GET ${path} ===`);
    try {
      const response = await fudo.request('GET', `${path}${path.includes('?') ? '&' : '?'}page[size]=3`);
      const data = response?.data;
      if (!data) {
        console.log('Respuesta sin "data":', JSON.stringify(response).substring(0, 300));
        continue;
      }
      const items = Array.isArray(data) ? data : [data];
      console.log(`OK — ${items.length} registro(s) de muestra`);
      items.slice(0, 2).forEach((item, i) => {
        console.log(`\n--- registro ${i + 1} (type: ${item.type}) ---`);
        console.log('attributes:', JSON.stringify(item.attributes, null, 2));
        if (item.relationships) {
          console.log('relationships keys:', Object.keys(item.relationships));
        }
      });
      if (response.included) {
        const types = [...new Set(response.included.map((i) => i.type))];
        console.log('\nincluded types:', types);
      }
    } catch (error) {
      const status = error.response?.status;
      console.log(`✗ Falló (${status || error.message})`);
    }
  }

  console.log('\n\nListo. Pega toda esta salida en el chat.');
}

main().catch((err) => {
  console.error('Error general:', err.message);
  process.exit(1);
});
