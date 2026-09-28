require('dotenv').config();
const FudoClient = require('./fudo-client');

/**
 * Segunda pasada de discovery: /expenses y /providers existen (confirmado
 * por discover-purchases.js) pero /expenses vino con "attributes: undefined"
 * en el dump resumido — hace falta ver el JSON crudo completo para saber si
 * trae línea por insumo (para conciliar contra pan/carne/pollo) o solo un
 * total, y qué relationships/includes expone.
 *
 * Uso: node src/discover-expenses-detail.js
 */

async function main() {
  const fudo = new FudoClient(
    process.env.FUDO_API_KEY,
    process.env.FUDO_API_SECRET,
    process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1'
  );

  await fudo.authenticate();
  console.log('✅ Autenticado.\n');

  console.log('=== GET /expenses (crudo, sin filtros) ===');
  try {
    const response = await fudo.request('GET', '/expenses?page[size]=3');
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.log(`✗ Falló (${error.response?.status || error.message})`);
  }

  const includeCandidates = [
    'provider',
    'ingredient',
    'ingredients',
    'items',
    'expenseItems',
    'payments',
  ];

  for (const inc of includeCandidates) {
    console.log(`\n=== GET /expenses?include=${inc} ===`);
    try {
      const response = await fudo.request('GET', `/expenses?include=${inc}&page[size]=2`);
      const included = response?.included;
      if (included && included.length > 0) {
        const types = [...new Set(included.map((i) => i.type))];
        console.log(`OK — trae included, types: ${types.join(', ')}`);
        console.log('muestra:', JSON.stringify(included[0], null, 2));
      } else {
        console.log('Sin "included" (el include no aplica o no hay datos relacionados)');
        console.log('data[0] crudo:', JSON.stringify(response?.data?.[0], null, 2));
      }
    } catch (error) {
      console.log(`✗ Falló (${error.response?.status || error.message})`);
    }
  }

  console.log('\n=== GET /providers (crudo, un registro completo) ===');
  try {
    const response = await fudo.request('GET', '/providers?page[size]=1');
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.log(`✗ Falló (${error.response?.status || error.message})`);
  }

  console.log('\n\nListo. Pega toda esta salida en el chat.');
}

main().catch((err) => {
  console.error('Error general:', err.message);
  process.exit(1);
});
