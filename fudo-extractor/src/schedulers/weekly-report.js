require('dotenv').config();
const cron = require('node-cron');
const FudoClient = require('../fudo-client');
const KPICalculator = require('../kpi-calculator');
const BasecampIntegration = require('../integrations/basecamp');
const GoogleDriveIntegration = require('../integrations/google-drive');
const fs = require('fs');
const path = require('path');

/**
 * Reporte semanal de KPIs, publicado como mensaje nuevo en Basecamp y
 * respaldado como JSON en Google Drive.
 * Corre cada lunes a las 08:00 AM.
 */

const fudo = new FudoClient(
  process.env.FUDO_API_KEY,
  process.env.FUDO_API_SECRET,
  process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1'
);

const basecamp = new BasecampIntegration();
const googleDrive = new GoogleDriveIntegration();

const dataDir = process.env.DATA_OUTPUT_DIR || './data';

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

async function generateWeeklyReport(rangeStart = null, rangeEnd = null) {
  console.log(`\n📋 Generando reporte semanal [${new Date().toISOString()}]`);

  try {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const start = rangeStart || weekAgo;
    const end = rangeEnd || today;

    const sales = await fudo.getSales(start, end);
    const cogsResult = fudo.calculateCOGS(sales);

    const period = { start: fudo.formatDate(start), end: fudo.formatDate(end) };
    const manualLaborCost = process.env.WEEKLY_LABOR_COST
      ? Number(process.env.WEEKLY_LABOR_COST)
      : null;

    const metrics = KPICalculator.calculate(sales, cogsResult, manualLaborCost, period);

    const weeklyReport = {
      weekStart: period.start,
      weekEnd: period.end,
      generatedAt: new Date().toISOString(),
      metrics,
      dailyBreakdown: getDailyBreakdown(sales),
      topProducts: getTopProducts(sales, 10),
      waiterRanking: FudoClient.calculateWaiterMetrics(sales),
      salesChannels: analyzeSalesChannels(sales),
    };

    const filename = `weekly-report-${period.start}-a-${period.end}.json`;
    const filepath = path.join(dataDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(weeklyReport, null, 2));

    const daysInRange = Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1);

    console.log(`✅ Reporte generado: ${filename}`);
    console.log(`\n📅 Ventas por día:`);
    weeklyReport.dailyBreakdown.forEach((d) => {
      console.log(`   ${d.date} — $${d.grossSales.toFixed(2)} · ${d.covers} tickets · promedio $${d.avgTicket}`);
    });
    console.log(`\n📊 KPIs Principales:`);
    console.log(`   💰 Ventas totales: $${metrics.kpis.grossSales.toFixed(2)}`);
    console.log(`   🎫 Ticket promedio: $${metrics.kpis.averageCheck}`);
    console.log(`   📈 Tickets/día: ${(metrics.kpis.covers / daysInRange).toFixed(1)}`);
    console.log(`   📦 COGS: ${metrics.kpis.cogsPercentage === null ? 'sin datos' : metrics.kpis.cogsPercentage + '%'}`);

    await basecamp.postWeeklyMessage(metrics, weeklyReport.dailyBreakdown);
    await googleDrive.uploadReport(weeklyReport, filename);

    return weeklyReport;
  } catch (error) {
    console.error('❌ Error generando reporte semanal:', error.message);
  }
}

function getDailyBreakdown(sales) {
  const days = {};

  sales.forEach((sale) => {
    const day = fudo.localDateOf(sale.closedAt || sale.createdAt);
    if (!day) return;
    if (!days[day]) days[day] = { date: day, covers: 0, grossSales: 0 };
    days[day].covers += 1;
    days[day].grossSales += sale.total;
  });

  return Object.values(days)
    .map((d) => ({
      ...d,
      grossSales: Number(d.grossSales.toFixed(2)),
      avgTicket: d.covers > 0 ? Number((d.grossSales / d.covers).toFixed(2)) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getTopProducts(sales, limit = 10) {
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

function analyzeSalesChannels(sales) {
  const channels = {};

  sales.forEach((sale) => {
    const channel = sale.saleType || 'DESCONOCIDO';
    if (!channels[channel]) channels[channel] = { orders: 0, sales: 0 };
    channels[channel].orders += 1;
    channels[channel].sales += sale.total;
  });

  const total = sales.length || 1;
  return Object.fromEntries(
    Object.entries(channels).map(([channel, data]) => [
      channel,
      {
        ...data,
        percentage: Number(((data.orders / total) * 100).toFixed(2)),
        avgTicket: Number((data.sales / (data.orders || 1)).toFixed(2)),
      },
    ])
  );
}

cron.schedule('0 8 * * 1', () => generateWeeklyReport());

console.log(`⏰ Reporte semanal programado`);
console.log(`   Ejecución: Cada lunes a las 08:00 AM\n`);

// Rango custom opcional: node src/schedulers/weekly-report.js 2026-09-01 2026-09-08
const [, , cliStart, cliEnd] = process.argv;
// -06:00 fijo (CDMX, sin horario de verano) para que el YYYY-MM-DD que se pasa
// por CLI sea exactamente ese día calendario local — debe coincidir con cómo
// fudo.formatDate()/localDateOf() interpretan las fechas (ver fudo-client.js).
const rangeStart = cliStart ? new Date(`${cliStart}T00:00:00-06:00`) : null;
const rangeEnd = cliEnd ? new Date(`${cliEnd}T23:59:59-06:00`) : null;

if (process.env.NODE_ENV !== 'production') {
  console.log('🧪 Modo desarrollo: ejecutando reporte semanal inmediato...\n');
  generateWeeklyReport(rangeStart, rangeEnd);
}

module.exports = { generateWeeklyReport };
