const axios = require('axios');
const crypto = require('crypto');

class FudoClient {
  constructor(apiKey, apiSecret, baseUrl = 'https://api.fudoapp.com') {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
    });
  }

  /**
   * Genera signature para autenticación OAuth-like
   * Basado en documentación de Fudo
   */
  generateSignature(method, endpoint, timestamp, nonce) {
    const baseString = `${method.toUpperCase()}&${encodeURIComponent(endpoint)}&`;
    const signatureKey = `${this.apiSecret}&`;

    const hmac = crypto
      .createHmac('sha256', signatureKey)
      .update(baseString)
      .digest('base64');

    return hmac;
  }

  /**
   * Realiza request autenticado a Fudo
   */
  async request(method, endpoint, data = null) {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = Math.random().toString(36).substring(2, 15);

      const headers = {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-Fudo-Timestamp': timestamp,
        'X-Fudo-Nonce': nonce,
      };

      const config = {
        method,
        url: endpoint,
        headers,
      };

      if (data && (method === 'POST' || method === 'PUT')) {
        config.data = data;
      }

      const response = await this.client(config);
      return response.data;
    } catch (error) {
      console.error(`Fudo API Error [${method} ${endpoint}]:`, error.message);
      if (error.response?.data) {
        console.error('Response:', error.response.data);
      }
      throw error;
    }
  }

  // ==================== ENDPOINTS ====================

  /**
   * Obtiene ventas del día o rango de fechas
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
        `/api/sales?start_date=${start}&end_date=${end}`
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
