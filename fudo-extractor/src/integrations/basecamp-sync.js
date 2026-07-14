require('dotenv').config();
const axios = require('axios');

/**
 * Integración con Basecamp
 * Sube resumen de reportes semanales al Message Board
 */

class BasecampSync {
  constructor() {
    // Basecamp requiere autenticación OAuth2
    // Por ahora usaremos un token de acceso personal
    this.token = process.env.BASECAMP_TOKEN;
    this.accountId = process.env.BASECAMP_ACCOUNT_ID;
    this.bucketId = process.env.BASECAMP_BUCKET_ID;
    this.baseUrl = 'https://3.basecampapi.com/';
  }

  /**
   * Crea un cliente HTTP autenticado
   */
  getClient() {
    if (!this.token) {
      console.warn('⚠️  BASECAMP_TOKEN no configurado');
      return null;
    }

    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Publica un mensaje en el Message Board
   */
  async postMessage(subject, content) {
    const client = this.getClient();
    if (!client) {
      console.log('⏭️  Basecamp sync desactivado (sin token)');
      return null;
    }

    try {
      const response = await client.post(
        `/${this.accountId}/buckets/${this.bucketId}/messages`,
        {
          subject: subject,
          content: content,
        }
      );

      console.log(`✅ Mensaje publicado en Basecamp: ${subject}`);
      return response.data.id;
    } catch (error) {
      console.error('Error publicando en Basecamp:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Formatea reporte semanal para Basecamp
   */
  formatWeeklyReportForBasecamp(report) {
    const kpis = report.kpis;
    const summary = report.summary;
    const topProducts = report.topProducts.slice(0, 5);
    const waiterRanking = report.waiterRanking.slice(0, 5);

    let content = `
<h2>📊 Reporte Semanal Instinto</h2>
<p><strong>Período:</strong> ${report.weekStart} al ${report.weekEnd}</p>

<h3>💰 Resumen Financiero</h3>
<ul>
  <li><strong>Ventas Totales:</strong> $${summary.totalSales.toLocaleString('es-MX')}</li>
  <li><strong>Ticket Promedio:</strong> $${summary.averageTicket}</li>
  <li><strong>Órdenes/Día:</strong> ${summary.ordersPerDay}</li>
  <li><strong>Ganancia Neta:</strong> $${kpis.netProfit}</li>
</ul>

<h3>📈 KPIs Clave</h3>
<ul>
  <li><strong>COGS:</strong> ${kpis.cogs.percentage}% (${kpis.cogs.status})</li>
  <li><strong>Margen Bruto:</strong> ${kpis.grossMargin}%</li>
  <li><strong>Punto de Equilibrio:</strong> ${kpis.breakEvenPoint} tickets/día</li>
  <li><strong>Margen Bruto Total:</strong> $${kpis.grossProfit}</li>
</ul>

<h3>🏆 Top 5 Productos</h3>
<table>
  <tr><th>Producto</th><th>Cantidad</th><th>Ingresos</th></tr>
${topProducts.map(p => `  <tr><td>${p.name}</td><td>${p.quantity}</td><td>$${p.revenue.toLocaleString('es-MX')}</td></tr>`).join('\n')}
</table>

<h3>👨‍💼 Top 5 Meseros</h3>
<table>
  <tr><th>Mesero</th><th>Tickets</th><th>Ventas</th><th>Promedio</th></tr>
${waiterRanking.map(w => `  <tr><td>${w.name}</td><td>${w.tickets}</td><td>$${w.totalSales.toLocaleString('es-MX')}</td><td>$${w.avgTicket}</td></tr>`).join('\n')}
</table>

<h3>📍 Canal de Ventas</h3>
<ul>
  <li><strong>Restaurant:</strong> ${report.domicilioAnalysis.restaurant.percentage}% ($${report.domicilioAnalysis.restaurant.sales.toLocaleString('es-MX')})</li>
  <li><strong>Domicilios:</strong> ${report.domicilioAnalysis.delivery.percentage}% ($${report.domicilioAnalysis.delivery.sales.toLocaleString('es-MX')})</li>
</ul>

<p><em>Generado automáticamente por Fudo Extractor</em></p>
    `;

    return content;
  }

  /**
   * Publica reporte semanal
   */
  async postWeeklyReport(report) {
    const subject = `📊 Reporte Semanal ${report.weekStart} al ${report.weekEnd}`;
    const content = this.formatWeeklyReportForBasecamp(report);

    return await this.postMessage(subject, content);
  }
}

module.exports = BasecampSync;
