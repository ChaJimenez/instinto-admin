require('dotenv').config();
const FudoClient = require('./fudo-client');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('🚀 Iniciando extractor de datos Fudo...\n');

  const fudo = new FudoClient(
    process.env.FUDO_API_SECRET,
    process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1'
  );

  // Crear directorio de datos si no existe
  const dataDir = process.env.DATA_OUTPUT_DIR || './data';
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  try {
    console.log('📊 Extrayendo datos...\n');

    // Obtener datos
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    console.log('  → Órdenes (últimos 7 días)...');
    const orders = await fudo.getOrders(sevenDaysAgo, today);

    console.log('  → Productos...');
    const products = await fudo.getProducts();

    console.log('  → Empleados...');
    const employees = await fudo.getEmployees();

    console.log('  → Ventas...');
    const sales = await fudo.getSales(sevenDaysAgo, today);

    // Compilar reportes
    const report = {
      generatedAt: new Date().toISOString(),
      periodStart: fudo.formatDate(sevenDaysAgo),
      periodEnd: fudo.formatDate(today),
      summary: {
        totalOrders: orders.length,
        totalProducts: products.length,
        totalEmployees: employees.length,
        totalSalesValue: sales.reduce((sum, s) => sum + (s.total || 0), 0),
      },
      data: {
        orders: orders.slice(0, 100), // Últimas 100 órdenes
        products: products,
        employees: employees,
        sales: sales,
      },
      kpis: {
        cogs: fudo.calculateCOGS(orders, products),
      },
    };

    // Guardar reporte
    const timestamp = new Date().toISOString().split('T')[0];
    const reportFile = path.join(dataDir, `fudo-report-${timestamp}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

    console.log(`\n✅ Reporte generado: ${reportFile}`);
    console.log(`\n📈 Resumen:`);
    console.log(`   - Órdenes: ${report.summary.totalOrders}`);
    console.log(`   - Productos: ${report.summary.totalProducts}`);
    console.log(`   - Empleados: ${report.summary.totalEmployees}`);
    console.log(`   - Ventas totales: $${report.summary.totalSalesValue.toFixed(2)}`);
    console.log(`   - COGS: ${report.kpis.cogs.cogsPercentage}%\n`);

  } catch (error) {
    console.error('❌ Error durante extracción:', error.message);
    process.exit(1);
  }
}

main();
