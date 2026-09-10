require('dotenv').config();
const cron = require('node-cron');
const FudoClient = require('../fudo-client');
const KPICalculator = require('../kpi-calculator');
const BasecampIntegration = require('../integrations/basecamp');
const fs = require('fs');
const path = require('path');

/**
 * Sincronización diaria de datos de Fudo + corte publicado en Basecamp.
 * Corre todos los días a las 00:10 y siempre publica el DÍA ANTERIOR
 * completo (nunca "hoy" — "hoy" todavía no terminó, sea que esto corra
 * a medianoche o a mano a media tarde, y reportaría ventas parciales o $0).
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
    const businessDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // día anterior completo
    const sales = await fudo.getSales(businessDate, businessDate);
    const cogsResult = fudo.calculateCOGS(sales);

    const period = { start: fudo.formatDate(businessDate), end: fudo.formatDate(businessDate) };
    const manualLaborCost = process.env.DAILY_LABOR_COST
      ? Number(process.env.DAILY_LABOR_COST)
      : null;

    const metrics = KPICalculator.calculate(sales, cogsResult, manualLaborCost, period);

    const topProducts = getTopProducts(sales, 5);
    const waiterPerformance = FudoClient.calculateWaiterMetrics(sales);
    const channelPerformance = FudoClient.calculateChannelMetrics(sales);
    const salesByHour = fudo.calculateSalesByHour(sales);
    const tipsTotal = sales.reduce((sum, s) => sum + (s.tips || 0), 0);
    // `sales.length` (= metrics.kpis.covers) es conteo de ÓRDENES, no de
    // comensales — Fudo mismo distingue "Ventas: 18" de "Personas: 31" en su
    // propia UI. sale.people ya viene normalizado en fudo-client, sin usar hasta ahora.
    const peopleTotal = sales.reduce((sum, s) => sum + (s.people || 0), 0);

    const dailyData = {
      date: fudo.formatDate(businessDate),
      timestamp: new Date().toISOString(),
      metrics,
      topProducts,
      waiterPerformance,
      channelPerformance,
      salesByHour,
      tipsTotal,
      peopleTotal,
    };

    const filename = `daily-${fudo.formatDate(businessDate)}.json`;
    const filepath = path.join(dataDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(dailyData, null, 2));

    console.log(`✅ Datos sincronizados: ${filename}`);
    console.log(`   📊 Tickets: ${metrics.kpis.covers}`);
    console.log(`   💰 Ventas: $${metrics.kpis.grossSales.toFixed(2)}`);
    console.log(`   🎫 Ticket promedio: $${metrics.kpis.averageCheck}`);

    const previousDay = readPreviousDay(businessDate);

    await basecamp.updateDailyMessage(metrics, {
      topProducts,
      waiterPerformance,
      channelPerformance,
      salesByHour,
      tipsTotal,
      peopleTotal,
      previousDay,
    });

    // Se activa manualmente cuando Cha termine el conteo físico de inventario
    // en Fudo (Ingredientes > Conteo de inventario) — antes de eso, el stock
    // negativo generalizado hace que este reporte no sea confiable todavía.
    if (process.env.INVENTORY_ALERTS_ENABLED === 'true') {
      const ingredients = await fudo.getIngredients();
      const lowStockResult = FudoClient.calculateLowStock(ingredients);
      await basecamp.updateInventoryMessage(lowStockResult, fudo.formatDate(businessDate));
    }
  } catch (error) {
    console.error('❌ Error en sincronización diaria:', error.message);
  }
}

/**
 * Lee el JSON ya guardado del día inmediato anterior a `businessDate` (si
 * existe) para poder comparar "vs. ayer" en el corte. Usa los archivos que
 * ya escribe este mismo script — no pega otra vez a la API de Fudo.
 */
function readPreviousDay(businessDate) {
  const priorDate = new Date(businessDate.getTime() - 24 * 60 * 60 * 1000);
  const filepath = path.join(dataDir, `daily-${fudo.formatDate(priorDate)}.json`);
  if (!fs.existsSync(filepath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    return { date: data.date, grossSales: data.metrics.kpis.grossSales, covers: data.metrics.kpis.covers };
  } catch {
    return null;
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
      // item.price ya es el total de la línea, no el precio unitario — no
      // volver a multiplicar por quantity (ver comentario en calculateCOGS).
      productMap[item.productId].revenue += item.price;
    });
  });

  return Object.values(productMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

const scheduledTime = process.env.SYNC_TIME || '10 0 * * *';

// Solo arranca el cron / corre inmediato si este archivo se ejecuta
// directamente (`node src/schedulers/daily-sync.js`). Si otro script hace
// `require('./daily-sync')` para llamar a syncDailyData() él mismo, esto
// evita que corra dos veces (bug real: causó un corte duplicado en Basecamp).
if (require.main === module) {
  console.log(`⏰ Scheduler iniciado`);
  console.log(`   Próxima ejecución: ${scheduledTime}`);
  console.log(`   (Diariamente a las 00:10, publica el día anterior completo)\n`);

  cron.schedule(scheduledTime, syncDailyData);

  if (process.env.RUN_IMMEDIATELY === 'true') {
    console.log('🧪 RUN_IMMEDIATELY=true: ejecutando sincronización ahora...\n');
    syncDailyData();
  }
}

module.exports = { syncDailyData };
