require('dotenv').config();
const express = require('express');
const path = require('path');
const FudoClient = require('./src/fudo-client');
const KPICalculator = require('./src/kpi-calculator');
const GoogleDriveIntegration = require('./src/integrations/google-drive');
const BasecampIntegration = require('./src/integrations/basecamp');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize services
const fudoClient = new FudoClient(
  process.env.FUDO_API_KEY,
  process.env.FUDO_API_SECRET,
  process.env.FUDO_BASE_URL
);

let cachedMetrics = null;
let lastFetch = null;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutos

/**
 * GET /api/metrics
 * Retorna los KPIs calculados desde Fudo
 */
app.get('/api/metrics', async (req, res) => {
  try {
    // Servir desde cache si es reciente
    if (cachedMetrics && lastFetch && Date.now() - lastFetch < CACHE_TTL) {
      console.log('📦 Serving cached metrics');
      return res.json(cachedMetrics);
    }

    console.log('🔄 Fetching fresh metrics from Fudo...');

    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch data from Fudo in parallel
    const [orders, products, employees, sales] = await Promise.all([
      fudoClient.getOrders(sevenDaysAgo, today),
      fudoClient.getProducts(),
      fudoClient.getEmployees(),
      fudoClient.getSales(sevenDaysAgo, today),
    ]);

    // Calculate KPIs
    const metrics = KPICalculator.calculate(orders, products, employees, sales);

    // Cache the result
    cachedMetrics = metrics;
    lastFetch = Date.now();

    // Trigger async integrations (don't wait)
    updateIntegrations(metrics);

    console.log('✅ Metrics calculated successfully');
    res.json(metrics);
  } catch (error) {
    console.error('❌ Error fetching metrics:', error.message);
    res.status(500).json({
      error: 'Failed to fetch metrics',
      message: error.message,
    });
  }
});

/**
 * GET /api/status
 * Health check
 */
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    cached: !!cachedMetrics,
    lastUpdate: lastFetch ? new Date(lastFetch).toISOString() : 'never',
  });
});

/**
 * GET /dashboard
 * Serve dashboard HTML
 */
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

/**
 * Update integrations asynchronously
 */
async function updateIntegrations(metrics) {
  try {
    // Google Drive - save weekly report
    if (isWeeklyReport()) {
      const gdriveToken = process.env.GOOGLE_DRIVE_TOKEN;
      if (gdriveToken) {
        const gdrive = new GoogleDriveIntegration(gdriveToken);
        await gdrive.uploadReport(metrics, `instinto-report-${new Date().toISOString().split('T')[0]}.json`);
      }
    }

    // Basecamp - update message
    const basecampToken = process.env.BASECAMP_TOKEN;
    if (basecampToken && process.env.BASECAMP_MESSAGE_ID) {
      const basecamp = new BasecampIntegration(basecampToken);
      await basecamp.updateMessage(metrics);
    }
  } catch (error) {
    console.error('⚠️ Integration update failed:', error.message);
  }
}

/**
 * Check if today is the weekly report day (Friday)
 */
function isWeeklyReport() {
  const today = new Date();
  return today.getDay() === 5; // Friday
}

/**
 * 404 Handler
 */
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

/**
 * Error handler
 */
app.use((err, req, res, next) => {
  console.error('💥 Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Unknown error',
  });
});

/**
 * Start server
 */
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║  🍔 INSTINTO — POS DASHBOARD RUNNING   ║
╚════════════════════════════════════════╝

📊 Dashboard: http://localhost:${PORT}/dashboard
🔌 API:       http://localhost:${PORT}/api/metrics
✅ Status:    http://localhost:${PORT}/api/status

Credentials:
├─ Fudo API: ${process.env.FUDO_API_KEY ? '✓' : '✗'}
├─ Google Drive: ${process.env.GOOGLE_DRIVE_TOKEN ? '✓' : '✗'}
└─ Basecamp: ${process.env.BASECAMP_TOKEN ? '✓' : '✗'}

Environment: ${process.env.NODE_ENV || 'development'}
  `);

  // Optional: warm up cache on startup
  setImmediate(async () => {
    try {
      await fetch(`http://localhost:${PORT}/api/metrics`);
      console.log('🚀 Initial metrics loaded');
    } catch (error) {
      console.error('⚠️ Failed to warm cache:', error.message);
    }
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  process.exit(0);
});

module.exports = app;
