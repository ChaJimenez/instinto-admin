require('dotenv').config();
const axios = require('axios');

/**
 * Script de prueba para verificar conectividad con API de Fudo
 * Ejecutar: npm run test
 */

async function testFudoConnection() {
  console.log('🔧 Probando conexión con Fudo API...\n');

  const apiSecret = process.env.FUDO_API_SECRET;
  const baseUrl = process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1';

  if (!apiSecret) {
    console.error('❌ Error: FUDO_API_SECRET no está configurado en .env');
    process.exit(1);
  }

  console.log(`API Secret: ${apiSecret.substring(0, 10)}...`);
  console.log(`Base URL: ${baseUrl}\n`);

  try {
    console.log('1️⃣  Probando endpoint GET /sales...');
    const salesResponse = await axios.get(`${baseUrl}/sales`, {
      headers: {
        'Authorization': `Bearer ${apiSecret}`,
        'Content-Type': 'application/json',
      },
      timeout: 5000,
    });
    console.log('✅ Conexión OK');
    console.log(`   Respuesta: ${JSON.stringify(salesResponse.data).substring(0, 100)}...\n`);

  } catch (error) {
    console.error('❌ Error de conexión:');
    console.error(`   ${error.message}`);

    if (error.response?.status === 401) {
      console.error('   → Credenciales inválidas (401 Unauthorized)');
    } else if (error.response?.status === 403) {
      console.error('   → Acceso denegado (403 Forbidden)');
    }
    console.log('\n📝 Verificar:');
    console.log('   1. FUDO_API_SECRET correcto en .env');
    console.log('   2. Base URL: https://api.fu.do/v1alpha1');
    console.log('   3. Firewall/Proxy bloqueando');
    process.exit(1);
  }

  console.log('\n📋 Próximos pasos:');
  console.log('1. Si la conexión fue exitosa, ejecutar: npm start');
  console.log('2. Ver reporte en ./data/fudo-report-YYYY-MM-DD.json\n');
}

testFudoConnection();
