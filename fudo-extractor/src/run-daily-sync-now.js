/**
 * Corre la sincronización diaria una sola vez, ahora mismo, sin arrancar
 * el cron ni quedarse esperando. Uso: node src/run-daily-sync-now.js
 */
const { syncDailyData } = require('./schedulers/daily-sync');

syncDailyData().then(() => process.exit(0));
