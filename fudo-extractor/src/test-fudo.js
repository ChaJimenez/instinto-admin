require('dotenv').config();
const axios = require('axios');

/**
 * Script de prueba para verificar conectividad con API de Fudo
 * Ejecutar: npm run test
 */

async function testFudoConnection() {
  console.log('🔧 Probando conexión con Fudo API...\n');

  const apiKey = process.env.FUDO_API_KEY;
  const apiSecret = process.env.FUDO_API_SECRET;
  const baseUrl = process.env.FUDO_BASE_URL || 'https://api.fudoapp.com';

  if (!apiKey) {
    console.error('❌ Error: FUDO_API_KEY no está configurado en .env');
    process.exit(1);
  }

  console.log(`API Key: ${apiKey.substring(0, 5)}...`);
  console.log(`Base URL: ${baseUrl}\n`);

  try {
    console.log('1️⃣  Probando endpoint /api/health o /api/status...');
    const healthResponse = await axios.get(`${baseUrl}/api/health`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 5000,
    });
    console.log('✅ Conexión OK\n');

  } catch (healthError) {
    console.log('⚠️  /api/health no disponible, intentando /api/orders...\n');

    try {
      console.log('2️⃣  Probando endpoint /api/orders...');
      const ordersResponse = await axios.get(`${baseUrl}/api/orders`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      });
      console.log('✅ Conexión OK');
      console.log(`   Respuesta: ${JSON.stringify(ordersResponse.data).substring(0, 100)}...\n`);

    } catch (ordersError) {
      console.error('❌ Error de conexión:');
      console.error(`   ${ordersError.message}`);

      if (ordersError.response?.status === 401) {
        console.error('   → Credenciales inválidas (401 Unauthorized)');
      } else if (ordersError.response?.status === 403) {
        console.error('   → Acceso denegado (403 Forbidden)');
      }
      console.log('\n📝 Verificar:');
      console.log('   1. FUDO_API_KEY y FUDO_API_SECRET en .env');
      console.log('   2. URL base correcta');
      console.log('   3. Firewall/Proxy bloqueando');
      process.exit(1);
    }
  }

  console.log('\n📋 Próximos pasos:');
  console.log('1. Actualizar FUDO_API_SECRET en .env (aún está como placeholder)');
  console.log('2. Ejecutar: npm start');
  console.log('3. Ver reporte en ./data/fudo-report-YYYY-MM-DD.json\n');
}

testFudoConnection();
