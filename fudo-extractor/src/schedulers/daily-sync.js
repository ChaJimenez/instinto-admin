require('dotenv').config();
const cron = require('node-cron');
const FudoClient = require('../fudo-client');
const fs = require('fs');
const path = require('path');

/**
 * Sincronización diaria de datos de Fudo
 * Corre todos los días a las 23:59 (antes del cierre)
 */

const fudo = new FudoClient(
  process.env.FUDO_API_KEY,
  process.env.FUDO_API_SECRET,
  process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1'
);

const dataDir = process.env.DATA_OUTPUT_DIR || './data';

// Crear directorio si no existe
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

async function syncDailyData() {
  console.log(`\n📅 Sincronización diaria de Fudo [${new Date().toISOString()}]`);

  try {
    const today = new Date();

    // Obtener datos del día
    const orders = await fudo.getOrders(today, today);
    const sales = await fudo.getSales(today, today);
    const products = await fudo.getProducts();

    // Compilar datos diarios
    const dailyData = {
      date: fudo.formatDate(today),
      timestamp: new Date().toISOString(),
      stats: {
        orders: orders.length,
        totalSales: sales.reduce((sum, s) => sum + (s.total || 0), 0),
        averageTicket: orders.length > 0
          ? (sales.reduce((sum, s) => sum + (s.total || 0), 0) / orders.length)
          : 0,
      },
      topProducts: getTopProducts(orders, 5),
      waiterPerformance: calculateWaiterMetrics(orders),
      orders: orders.slice(0, 50),
      cogs: fudo.calculateCOGS(orders, products),
    };

    // Guardar JSON
    const filename = `daily-${fudo.formatDate(today)}.json`;
    const filepath = path.join(dataDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(dailyData, null, 2));

    console.log(`✅ Datos sincronizados: ${filename}`);
    console.log(`   📊 Órdenes: ${dailyData.stats.orders}`);
    console.log(`   💰 Ventas: $${dailyData.stats.totalSales.toFixed(2)}`);
    console.log(`   🎫 Ticket promedio: $${dailyData.stats.averageTicket.toFixed(2)}`);

  } catch (error) {
    console.error('❌ Error en sincronización diaria:', error.message);
  }
}

function getTopProducts(orders, limit = 5) {
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

function calculateWaiterMetrics(orders) {
  const waiterMap = {};

  orders.forEach(order => {
    const waiterId = order.waiter_id || 'unknown';
    const waiterName = order.waiter_name || 'Sin asignar';

    if (!waiterMap[waiterId]) {
      waiterMap[waiterId] = {
        name: waiterName,
        tickets: 0,
        totalSales: 0,
        tips: 0,
      };
    }

    waiterMap[waiterId].tickets++;
    waiterMap[waiterId].totalSales += order.total || 0;
    waiterMap[waiterId].tips += order.tips || 0;
  });

  return Object.values(waiterMap)
    .map(w => ({
      ...w,
      avgTicket: (w.totalSales / w.tickets).toFixed(2),
      salesPerHour: (w.totalSales / 8).toFixed(2), // Asumiendo 8 horas
    }))
    .sort((a, b) => b.totalSales - a.totalSales);
}

// Programar ejecución diaria a las 23:55
// Formato cron: minuto hora día mes día-semana
const scheduledTime = process.env.SYNC_TIME || '55 23 * * *';

console.log(`⏰ Scheduler iniciado`);
console.log(`   Próxima ejecución: ${scheduledTime}`);
console.log(`   (Diariamente a las 23:55 por defecto)\n`);

cron.schedule(scheduledTime, syncDailyData);

// Ejecutar inmediatamente en desarrollo
if (process.env.NODE_ENV !== 'production') {
  console.log('🧪 Modo desarrollo: ejecutando sincronización inmediata...\n');
  syncDailyData();
}
