/**
 * Corre la sincronización diaria una sola vez, ahora mismo, sin arrancar
 * el cron ni quedarse esperando.
 * Uso normal (publica el día anterior): node src/run-daily-sync-now.js
 * Para rellenar un día pasado saltado: node src/run-daily-sync-now.js 2026-09-10
 */
const { syncDailyData } = require('./schedulers/daily-sync');

const dateOverride = process.argv[2];

syncDailyData(dateOverride).then(() => process.exit(0));
