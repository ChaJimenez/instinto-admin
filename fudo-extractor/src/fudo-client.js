const axios = require('axios');

class FudoClient {
  constructor(apiKey, apiSecret, baseUrl = 'https://api.fu.do/v1alpha1') {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = baseUrl;
    this.token = null;
    this.tokenExpiresAt = 0;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Autentica con Fudo intercambiando apiKey + apiSecret por un token.
   * Fudo NO acepta el apiSecret directamente como Bearer token:
   * primero hay que hacer POST /auth y usar el token que devuelve.
   * El token vence a las 24h; lo renovamos cuando falta poco.
   */
  async authenticate() {
    const now = Date.now();
    // Reusar token si aún es válido (con margen de 5 min)
    if (this.token && now < this.tokenExpiresAt - 5 * 60 * 1000) {
      return this.token;
    }

    try {
      const response = await this.client.post('/auth', {
        apiKey: this.apiKey,
        apiSecret: this.apiSecret,
      });

      // Fudo puede devolver { token } o { data: { token } }
      const token = response.data?.token || response.data?.data?.token;
      if (!token) {
        throw new Error(
          `Respuesta de /auth sin token: ${JSON.stringify(response.data).substring(0, 200)}`
        );
      }

      this.token = token;
      this.tokenExpiresAt = now + 24 * 60 * 60 * 1000; // 24h
      return token;
    } catch (error) {
      const status = error.response?.status;
      const body = error.response?.data;
      let hint = '';
      if (status === 401) hint = ' → apiKey o apiSecret inválidos';
      if (status === 404) hint = ' → endpoint /auth no existe (revisar ruta de login)';
      throw new Error(
        `Fallo de autenticación [POST /auth] ${status || ''}${hint}` +
        (body ? ` | ${JSON.stringify(body).substring(0, 200)}` : ` | ${error.message}`)
      );
    }
  }

  /**
   * Realiza request autenticado a Fudo.
   * Garantiza que hay un token válido antes de llamar.
   */
  async request(method, endpoint, data = null) {
    const token = await this.authenticate();
    try {
      const config = {
        method,
        url: endpoint,
        headers: { 'Authorization': `Bearer ${token}` },
      };

      if (data && (method === 'POST' || method === 'PUT')) {
        config.data = data;
      }

      const response = await this.client(config);
      return response.data;
    } catch (error) {
      // Si el token expiró (401), reintentar una vez con token nuevo
      if (error.response?.status === 401) {
        this.token = null;
        const freshToken = await this.authenticate();
        const retry = await this.client({
          method,
          url: endpoint,
          headers: { 'Authorization': `Bearer ${freshToken}` },
          ...(data && (method === 'POST' || method === 'PUT') ? { data } : {}),
        });
        return retry.data;
      }
      console.error(`Fudo API Error [${method} ${endpoint}]:`, error.message);
      if (error.response?.data) {
        console.error('Response:', JSON.stringify(error.response.data).substring(0, 300));
      }
      throw error;
    }
  }

  // ==================== ENDPOINTS ====================

  /**
   * Obtiene ventas del día o rango de fechas
   * Endpoint: GET /sales
   * @param {Date} startDate - Fecha inicio (default: hoy)
   * @param {Date} endDate - Fecha fin (default: hoy)
   * @returns {Array} Array de ventas
   */
  async getSales(startDate = new Date(), endDate = new Date()) {
    const start = this.formatDate(startDate);
    const end = this.formatDate(endDate);

    try {
      const sales = await this.request(
        'GET',
        `/sales?start_date=${start}&end_date=${end}`
      );
      return sales;
    } catch (error) {
      console.error('Error fetching sales:', error);
      return [];
    }
  }

  /**
   * Obtiene órdenes/tickets
   */
  async getOrders(startDate = new Date(), endDate = new Date()) {
    const start = this.formatDate(startDate);
    const end = this.formatDate(endDate);

    try {
      const orders = await this.request(
        'GET',
        `/api/orders?start_date=${start}&end_date=${end}`
      );
      return orders;
    } catch (error) {
      console.error('Error fetching orders:', error);
      return [];
    }
  }

  /**
   * Obtiene catálogo de productos
   */
  async getProducts() {
    try {
      const products = await this.request('GET', '/api/products');
      return products;
    } catch (error) {
      console.error('Error fetching products:', error);
      return [];
    }
  }

  /**
   * Obtiene información de empleados/meseros
   */
  async getEmployees() {
    try {
      const employees = await this.request('GET', '/api/employees');
      return employees;
    } catch (error) {
      console.error('Error fetching employees:', error);
      return [];
    }
  }

  /**
   * Obtiene reportes de ventas por período
   */
  async getReports(reportType = 'daily', startDate = new Date(), endDate = new Date()) {
    const start = this.formatDate(startDate);
    const end = this.formatDate(endDate);

    try {
      const reports = await this.request(
        'GET',
        `/api/reports/${reportType}?start_date=${start}&end_date=${end}`
      );
      return reports;
    } catch (error) {
      console.error(`Error fetching ${reportType} reports:`, error);
      return [];
    }
  }

  /**
   * Obtiene métricas por mesero
   */
  async getWaiterMetrics(startDate = new Date(), endDate = new Date()) {
    const start = this.formatDate(startDate);
    const end = this.formatDate(endDate);

    try {
      const metrics = await this.request(
        'GET',
        `/api/analytics/waiters?start_date=${start}&end_date=${end}`
      );
      return metrics;
    } catch (error) {
      console.error('Error fetching waiter metrics:', error);
      return [];
    }
  }

  /**
   * Obtiene costos de insumos
   */
  async getInventory() {
    try {
      const inventory = await this.request('GET', '/api/inventory');
      return inventory;
    } catch (error) {
      console.error('Error fetching inventory:', error);
      return [];
    }
  }

  // ==================== HELPERS ====================

  formatDate(date) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  /**
   * Calcula COGS (Costo de Bienes Vendidos)
   */
  calculateCOGS(orders, products) {
    let totalCost = 0;
    let totalSales = 0;

    orders.forEach(order => {
      if (order.items) {
        order.items.forEach(item => {
          const product = products.find(p => p.id === item.product_id);
          if (product) {
            totalCost += (item.quantity * (product.cost || 0));
            totalSales += (item.quantity * item.price);
          }
        });
      }
    });

    return {
      totalCost,
      totalSales,
      cogsPercentage: totalSales > 0 ? ((totalCost / totalSales) * 100).toFixed(2) : 0,
    };
  }
}

module.exports = FudoClient;
