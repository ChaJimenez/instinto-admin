require('dotenv').config();
const cron = require('node-cron');
const FudoClient = require('../fudo-client');
const KPICalculator = require('../kpi-calculator');
const BasecampIntegration = require('../integrations/basecamp');
const fs = require('fs');
const path = require('path');

/**
 * Sincronización diaria de datos de Fudo + corte publicado en Basecamp.
 * Corre todos los días a las 23:55 (antes del cierre).
 */

const fudo = new FudoClient(
  process.env.FUDO_API_KEY,
  process.env.FUDO_API_SECRET,
  process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1'
);

const basecamp = new BasecampIntegration();

const dataDir = process.env.DATA_OUTPUT_DIR || './data';

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

async function syncDailyData() {
  console.log(`\n📅 Sincronización diaria de Fudo [${new Date().toISOString()}]`);

  try {
    const today = new Date();
    const sales = await fudo.getSales(today, today);
    const cogsResult = fudo.calculateCOGS(sales);

    const period = { start: fudo.formatDate(today), end: fudo.formatDate(today) };
    const manualLaborCost = process.env.DAILY_LABOR_COST
      ? Number(process.env.DAILY_LABOR_COST)
      : null;

    const metrics = KPICalculator.calculate(sales, cogsResult, manualLaborCost, period);

    const dailyData = {
      date: fudo.formatDate(today),
      timestamp: new Date().toISOString(),
      metrics,
      topProducts: getTopProducts(sales, 5),
      waiterPerformance: FudoClient.calculateWaiterMetrics(sales),
    };

    const filename = `daily-${fudo.formatDate(today)}.json`;
    const filepath = path.join(dataDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(dailyData, null, 2));

    console.log(`✅ Datos sincronizados: ${filename}`);
    console.log(`   📊 Tickets: ${metrics.kpis.covers}`);
    console.log(`   💰 Ventas: $${metrics.kpis.grossSales.toFixed(2)}`);
    console.log(`   🎫 Ticket promedio: $${metrics.kpis.averageCheck}`);

    await basecamp.updateDailyMessage(metrics);

    const ingredients = await fudo.getIngredients();
    const lowStockResult = FudoClient.calculateLowStock(ingredients);
    await basecamp.updateInventoryMessage(lowStockResult, fudo.formatDate(today));
  } catch (error) {
    console.error('❌ Error en sincronización diaria:', error.message);
  }
}

function getTopProducts(sales, limit = 5) {
  const productMap = {};

  sales.forEach((sale) => {
    sale.items.forEach((item) => {
      if (item.canceled) return;
      if (!productMap[item.productId]) {
        productMap[item.productId] = { name: item.productName, quantity: 0, revenue: 0 };
      }
      productMap[item.productId].quantity += item.quantity;
      productMap[item.productId].revenue += item.price * item.quantity;
    });
  });

  return Object.values(productMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

const scheduledTime = process.env.SYNC_TIME || '55 23 * * *';

console.log(`⏰ Scheduler iniciado`);
console.log(`   Próxima ejecución: ${scheduledTime}`);
console.log(`   (Diariamente a las 23:55 por defecto)\n`);

cron.schedule(scheduledTime, syncDailyData);

if (process.env.NODE_ENV !== 'production') {
  console.log('🧪 Modo desarrollo: ejecutando sincronización inmediata...\n');
  syncDailyData();
}

module.exports = { syncDailyData };
