require('dotenv').config();
const cron = require('node-cron');
const FudoClient = require('../fudo-client');
const fs = require('fs');
const path = require('path');

/**
 * Reporte semanal de KPIs
 * Corre cada lunes a las 08:00 AM
 */

const fudo = new FudoClient(
  process.env.FUDO_API_SECRET,
  process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1'
);

const dataDir = process.env.DATA_OUTPUT_DIR || './data';

// Crear directorio si no existe
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

async function generateWeeklyReport() {
  console.log(`\n📋 Generando reporte semanal [${new Date().toISOString()}]`);

  try {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Datos de la semana
    const orders = await fudo.getOrders(weekAgo, today);
    const products = await fudo.getProducts();
    const employees = await fudo.getEmployees();
    const sales = await fudo.getSales(weekAgo, today);

    // Cálculos de KPIs
    const kpis = calculateKPIs(orders, products, sales, weekAgo, today);

    const weeklyReport = {
      weekStart: fudo.formatDate(weekAgo),
      weekEnd: fudo.formatDate(today),
      generatedAt: new Date().toISOString(),
      summary: {
        totalOrders: orders.length,
        totalSales: orders.reduce((sum, o) => sum + (o.total || 0), 0),
        ordersPerDay: (orders.length / 7).toFixed(1),
        averageTicket: (orders.reduce((sum, o) => sum + (o.total || 0), 0) / orders.length).toFixed(2),
      },
      kpis: kpis,
      topProducts: getTopProducts(orders, 10),
      waiterRanking: getRanking(orders, 'waiter'),
      productAnalysis: analyzeProducts(orders, products),
      domicilioAnalysis: analyzeSalesChannels(orders),
      inventory: await fudo.getInventory(),
    };

    // Guardar reporte
    const week = `W${Math.ceil((today.getDate()) / 7)}`;
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const filename = `weekly-report-${today.getFullYear()}-${month}-${week}.json`;
    const filepath = path.join(dataDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(weeklyReport, null, 2));

    console.log(`✅ Reporte generado: ${filename}`);
    console.log(`\n📊 KPIs Principales:`);
    console.log(`   💰 Ventas totales: $${weeklyReport.summary.totalSales.toFixed(2)}`);
    console.log(`   🎫 Ticket promedio: $${weeklyReport.summary.averageTicket}`);
    console.log(`   📈 Órdenes/día: ${weeklyReport.summary.ordersPerDay}`);
    console.log(`   📦 COGS: ${kpis.cogs.percentage}%`);
    console.log(`   📍 Punto de equilibrio: ${kpis.breakEvenPoint} tickets/día`);

    return weeklyReport;

  } catch (error) {
    console.error('❌ Error generando reporte semanal:', error.message);
  }
}

function calculateKPIs(orders, products, sales, startDate, endDate) {
  const totalSales = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalCogs = orders.reduce((sum, o) => {
    if (o.items) {
      return sum + o.items.reduce((itemSum, item) => {
        const product = products.find(p => p.id === item.product_id);
        return itemSum + (item.quantity * (product?.cost || 0));
      }, 0);
    }
    return sum;
  }, 0);

  // Costos fijos estimados (ajustar según tu negocio)
  const estimatedFixedCosts = 5000; // $ por semana

  return {
    cogs: {
      total: totalCogs.toFixed(2),
      percentage: ((totalCogs / totalSales) * 100).toFixed(2),
      status: totalCogs / totalSales < 0.35 ? 'OK' : 'ALTO',
    },
    grossProfit: (totalSales - totalCogs).toFixed(2),
    grossMargin: (((totalSales - totalCogs) / totalSales) * 100).toFixed(2),
    breakEvenPoint: Math.ceil(estimatedFixedCosts / (totalSales / orders.length)),
    netProfit: (totalSales - totalCogs - estimatedFixedCosts).toFixed(2),
    orderCount: orders.length,
    avgOrderValue: (totalSales / orders.length).toFixed(2),
  };
}

function getTopProducts(orders, limit = 10) {
  const productMap = {};

  orders.forEach(order => {
    if (order.items) {
      order.items.forEach(item => {
        if (!productMap[item.product_id]) {
          productMap[item.product_id] = {
            name: item.product_name || item.product_id,
            quantity: 0,
            revenue: 0,
          };
        }
        productMap[item.product_id].quantity += item.quantity || 1;
        productMap[item.product_id].revenue += item.price * (item.quantity || 1);
      });
    }
  });

  return Object.values(productMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

function getRanking(orders, type = 'waiter') {
  const map = {};

  orders.forEach(order => {
    const id = type === 'waiter' ? order.waiter_id : order.delivery_id;
    const name = type === 'waiter' ? order.waiter_name : order.delivery_name || 'Domicilio';

    if (!map[id]) {
      map[id] = {
        name: name || 'Sin asignar',
        tickets: 0,
        totalSales: 0,
        tips: 0,
      };
    }

    map[id].tickets++;
    map[id].totalSales += order.total || 0;
    map[id].tips += order.tips || 0;
  });

  return Object.values(map)
    .map((m, idx) => ({
      rank: idx + 1,
      ...m,
      avgTicket: (m.totalSales / m.tickets).toFixed(2),
    }))
    .sort((a, b) => b.totalSales - a.totalSales);
}

function analyzeProducts(orders, products) {
  const analysis = {};

  orders.forEach(order => {
    if (order.items) {
      order.items.forEach(item => {
        const product = products.find(p => p.id === item.product_id);
        if (!analysis[item.product_id]) {
          analysis[item.product_id] = {
            name: item.product_name,
            costPerUnit: product?.cost || 0,
            soldUnits: 0,
            revenue: 0,
            cost: 0,
          };
        }

        analysis[item.product_id].soldUnits += item.quantity || 1;
        analysis[item.product_id].revenue += item.price * (item.quantity || 1);
        analysis[item.product_id].cost += (item.quantity || 1) * (product?.cost || 0);
      });
    }
  });

  return Object.values(analysis)
    .map(p => ({
      ...p,
      margin: ((p.revenue - p.cost) / p.revenue * 100).toFixed(2),
      marginStatus: p.revenue - p.cost > 0 ? 'RENTABLE' : 'PÉRDIDA',
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function analyzeSalesChannels(orders) {
  const channels = {
    restaurant: { orders: 0, sales: 0 },
    delivery: { orders: 0, sales: 0 },
  };

  orders.forEach(order => {
    const channel = order.delivery_id ? 'delivery' : 'restaurant';
    channels[channel].orders++;
    channels[channel].sales += order.total || 0;
  });

  return {
    restaurant: {
      ...channels.restaurant,
      percentage: ((channels.restaurant.orders / orders.length) * 100).toFixed(2),
      avgTicket: (channels.restaurant.sales / (channels.restaurant.orders || 1)).toFixed(2),
    },
    delivery: {
      ...channels.delivery,
      percentage: ((channels.delivery.orders / orders.length) * 100).toFixed(2),
      avgTicket: (channels.delivery.sales / (channels.delivery.orders || 1)).toFixed(2),
    },
  };
}

// Programar cada lunes a las 08:00 AM
// Formato cron: minuto hora día mes día-semana (0 = domingo, 1 = lunes)
cron.schedule('0 8 * * 1', generateWeeklyReport);

console.log(`⏰ Reporte semanal programado`);
console.log(`   Ejecución: Cada lunes a las 08:00 AM\n`);

// Ejecutar inmediatamente en desarrollo
if (process.env.NODE_ENV !== 'production') {
  console.log('🧪 Modo desarrollo: ejecutando reporte semanal inmediato...\n');
  generateWeeklyReport();
}
