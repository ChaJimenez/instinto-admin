require('dotenv').config();
const FudoClient = require('./fudo-client');

/**
 * Prueba de conexión con Fudo.
 * Flujo real de Fudo: POST /auth (apiKey + apiSecret) -> token -> GET /sales
 * Ejecutar: npm run test
 */

async function main() {
  console.log('🔧 Probando conexión con Fudo API...\n');

  const apiKey = process.env.FUDO_API_KEY;
  const apiSecret = process.env.FUDO_API_SECRET;
  const baseUrl = process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1';

  if (!apiKey || !apiSecret) {
    console.error('❌ Falta FUDO_API_KEY o FUDO_API_SECRET en .env');
    console.error(`   API Key presente: ${!!apiKey}`);
    console.error(`   API Secret presente: ${!!apiSecret}`);
    process.exit(1);
  }

  console.log(`API Key:    ${apiKey}`);
  console.log(`API Secret: ${apiSecret.substring(0, 8)}...`);
  console.log(`Base URL:   ${baseUrl}\n`);

  const fudo = new FudoClient(apiKey, apiSecret, baseUrl);

  // Paso 1: Autenticación
  try {
    console.log('1️⃣  Autenticando (POST /auth con apiKey + apiSecret)...');
    const token = await fudo.authenticate();
    console.log(`✅ Token obtenido: ${token.substring(0, 20)}...\n`);
  } catch (error) {
    console.error(`❌ ${error.message}\n`);
    console.log('📝 Si el error es 404, el endpoint de login no es /auth.');
    console.log('   Comparte en dev.fu.do/api la ruta exacta de autenticación.');
    process.exit(1);
  }

  // Paso 2: Traer ventas
  try {
    console.log('2️⃣  Trayendo ventas (GET /sales)...');
    const sales = await fudo.request('GET', '/sales');
    const count = Array.isArray(sales?.data) ? sales.data.length
      : Array.isArray(sales) ? sales.length : '?';
    console.log(`✅ Ventas recibidas: ${count} registros`);
    console.log(`   Muestra: ${JSON.stringify(sales).substring(0, 200)}...\n`);
    console.log('🎉 ¡Conexión con Fudo exitosa! Ya puedes ejecutar: npm start');
  } catch (error) {
    console.error(`❌ Autenticó bien pero falló GET /sales: ${error.message}`);
    console.log('   El token funciona; puede ser que el endpoint sea distinto.');
    process.exit(1);
  }
}

main();
