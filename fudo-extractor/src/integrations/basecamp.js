const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

/**
 * Publica reportes de Instinto en Basecamp usando el CLI `basecamp` que ya
 * está autenticado en esta máquina (mismo que usan los skills del ecosistema).
 * No mantenemos un cliente HTTP/OAuth propio: reutilizamos esa sesión.
 *
 * Proyecto "Administración" (bucket 32427345, Message Board 6062062956) —
 * confirmado por Carlos el 2026-09-10, reemplaza al proyecto viejo
 * "Operaciones Instinto" (46274090). Todo lo automático va ahí ahora.
 * Hilo fijo de cortes diarios creado a mano por Carlos:
 * https://3.basecamp.com/5484659/buckets/32427345/messages/10289129219
 * (id 10289129219) — updateDailyMessage() le prepende el corte del día.
 */
class BasecampIntegration {
  constructor(config = {}) {
    this.accountId = config.accountId || process.env.BASECAMP_ACCOUNT_ID;
    this.bucketId = config.bucketId || process.env.BASECAMP_BUCKET_ID || '32427345';
    this.messageBoardId = config.messageBoardId || process.env.BASECAMP_MESSAGE_BOARD_ID || '6062062956';
    this.dailyMessageId = config.dailyMessageId || process.env.BASECAMP_MESSAGE_ID || '10289129219';
    this.inventoryMessageId = config.inventoryMessageId || process.env.BASECAMP_INVENTORY_MESSAGE_ID || '10289204960';
  }

  async run(args) {
    const { stdout } = await execFileAsync('basecamp', [
      ...args,
      '--account', this.accountId,
      '--project', this.bucketId,
      '--json',
    ]);
    return JSON.parse(stdout);
  }

  /**
   * Actualiza el mensaje mensual fijo prependiendo el corte del día.
   * Si no hay BASECAMP_MESSAGE_ID configurado, no hace nada (evita crear
   * mensajes duplicados por accidente).
   */
  async updateDailyMessage(metrics, extra = {}) {
    if (!this.dailyMessageId) {
      console.warn('⚠️  BASECAMP_MESSAGE_ID no configurado — no se actualiza Basecamp.');
      return null;
    }

    const current = await this.run([
      'messages', 'show', this.dailyMessageId,
      '--message-board', this.messageBoardId,
    ]);
    const subject = current.data?.subject || current.subject || '(sin asunto)';
    console.log(`   → Actualizando mensaje ${this.dailyMessageId} en bucket ${this.bucketId}: "${subject}"`);
    const previousContent = current.data?.content || current.content || '';

    const todayBlock = this.formatDailyBlockHTML(metrics, extra);
    const newContent = todayBlock + '<hr>' + previousContent;

    const result = await this.run([
      'messages', 'update', this.dailyMessageId,
      '--message-board', this.messageBoardId,
      '--body', newContent,
    ]);

    console.log(`✅ Corte del día agregado a Basecamp (mensaje ${this.dailyMessageId})`);
    return result;
  }

  /**
   * Actualiza el mensaje fijo de inventario prependiendo las alertas del día.
   * Mismo patrón que updateDailyMessage: un hilo fijo, se le agrega arriba
   * cada corte. Si no hay nada que alertar ese día, igual se agrega un
   * bloque corto confirmando que se revisó (para no dejar duda de si corrió).
   */
  async updateInventoryMessage(lowStockResult, dateLabel) {
    if (!this.inventoryMessageId) {
      console.warn('⚠️  BASECAMP_INVENTORY_MESSAGE_ID no configurado — no se actualiza el reporte de inventario.');
      return null;
    }

    const current = await this.run([
      'messages', 'show', this.inventoryMessageId,
      '--message-board', this.messageBoardId,
    ]);
    const previousContent = current.data?.content || current.content || '';

    const todayBlock = this.formatInventoryBlockHTML(lowStockResult, dateLabel);
    const newContent = todayBlock + '<hr>' + previousContent;

    const result = await this.run([
      'messages', 'update', this.inventoryMessageId,
      '--message-board', this.messageBoardId,
      '--body', newContent,
    ]);

    console.log(`✅ Alertas de inventario agregadas a Basecamp (mensaje ${this.inventoryMessageId})`);
    return result;
  }

  formatInventoryBlockHTML(lowStockResult, dateLabel) {
    const { negative, low, missingThreshold } = lowStockResult;

    if (negative.length === 0 && low.length === 0) {
      return `<p><strong>📦 ${dateLabel}</strong> — sin alertas de stock.</p>`;
    }

    let html = `<p><strong>📦 ${dateLabel}</strong></p>`;

    if (negative.length > 0) {
      const rows = negative
        .map((i) => `<li><strong>${i.name}</strong>: ${i.stock} (inventario en negativo — revisar conteo)</li>`)
        .join('');
      html += `<p style="color:#ef4444;"><strong>🔴 Inventario roto (stock negativo):</strong></p><ul>${rows}</ul>`;
    }

    if (low.length > 0) {
      const rows = low
        .map((i) => `<li><strong>${i.name}</strong>: ${i.stock} (mínimo: ${i.minStock})</li>`)
        .join('');
      html += `<p style="color:#f59e0b;"><strong>🟡 Bajo stock:</strong></p><ul>${rows}</ul>`;
    }

    if (missingThreshold.length > 0) {
      html += `<p><small>${missingThreshold.length} insumo(s) con control de stock activo pero sin "Stock mínimo" configurado — no se pueden evaluar.</small></p>`;
    }

    return html;
  }

  /**
   * Postea un mensaje nuevo con el reporte semanal (sí queremos historial semana a semana).
   */
  async postWeeklyMessage(metrics, dailyBreakdown = null) {
    const title = `Reporte Semanal — ${metrics.period.start} al ${metrics.period.end}`;
    const body = this.formatWeeklyHTML(metrics, dailyBreakdown);

    const result = await this.run([
      'message', title, body,
      '--message-board', this.messageBoardId,
    ]);

    console.log(`✅ Reporte semanal publicado en Basecamp: ${title}`);
    return result;
  }

  formatDailyBlockHTML(metrics, extra = {}) {
    const { kpis, period } = metrics;
    const { topProducts = [], waiterPerformance = [], channelPerformance = [], salesByHour = [], tipsTotal = 0, previousDay = null } = extra;

    const cogsLine = kpis.cogsPercentage === null
      ? '<em>COGS: sin datos de costo cargados en Fudo</em>'
      : `COGS: ${kpis.cogsPercentage}%`;

    const comparisonLine = this.formatComparisonLine(kpis, previousDay);

    let hourHTML = '';
    if (salesByHour.length > 0) {
      const peakHour = salesByHour.reduce((max, h) => (h.total > max.total ? h : max), salesByHour[0]);
      const rows = salesByHour
        .map((h) => {
          const label = `${String(h.hour).padStart(2, '0')}:00–${String((h.hour + 1) % 24).padStart(2, '0')}:00`;
          const peakMark = h.hour === peakHour.hour ? ' 🔥' : '';
          return `<li>${label}: $${h.total.toLocaleString('es-MX')} (${h.count} ticket${h.count === 1 ? '' : 's'})${peakMark}</li>`;
        })
        .join('');
      hourHTML = `<p><strong>Ventas por hora</strong> (🔥 hora pico):</p><ul>${rows}</ul>`;
    }

    let productsHTML = '';
    if (topProducts.length > 0) {
      const rows = topProducts
        .map((p) => `<li>${p.name}: ${p.quantity} uds · $${p.revenue.toLocaleString('es-MX')}</li>`)
        .join('');
      productsHTML = `<p><strong>Top 5 productos:</strong></p><ul>${rows}</ul>`;
    }

    let waiterHTML = '';
    if (waiterPerformance.length > 0) {
      const rows = waiterPerformance
        .map((w) => `<li>${w.name}: ${w.tickets} tickets · $${w.totalSales.toLocaleString('es-MX')} · promedio $${w.avgTicket.toFixed(2)}</li>`)
        .join('');
      waiterHTML = `<p><strong>Por mesero:</strong></p><ul>${rows}</ul>`;
    }

    // Aparte de "por mesero": mostrador/domicilio/Uber no tienen mesero por
    // diseño, no es un dato faltante — compararlas contra un mesero real
    // como si fuera una persona más no tiene sentido.
    let channelHTML = '';
    if (channelPerformance.length > 0) {
      const rows = channelPerformance
        .map((c) => `<li>${c.label}: ${c.tickets} tickets · $${c.totalSales.toLocaleString('es-MX')}</li>`)
        .join('');
      channelHTML = `<p><strong>Ventas sin mesero (por canal):</strong></p><ul>${rows}</ul>`;
    }

    const tipsLine = tipsTotal > 0 ? `<p>Propinas: $${tipsTotal.toLocaleString('es-MX')}</p>` : '';

    return `
      <p><strong>📅 ${period.end}</strong></p>
      <p>Ventas: $${kpis.grossSales.toLocaleString('es-MX')} · Tickets: ${kpis.covers} · Ticket promedio: $${kpis.averageCheck}</p>
      ${comparisonLine}
      <p>${cogsLine}</p>
      ${tipsLine}
      ${hourHTML}
      ${productsHTML}
      ${waiterHTML}
      ${channelHTML}
    `;
  }

  /**
   * "vs. ayer" — la comparación día a día es lo primero que un gerente de
   * restaurante quiere ver en un corte diario, más que el número absoluto.
   * Se omite si no hay datos guardados del día anterior (primera corrida).
   */
  formatComparisonLine(kpis, previousDay) {
    if (!previousDay || !previousDay.grossSales) return '';
    const deltaSales = ((kpis.grossSales - previousDay.grossSales) / previousDay.grossSales) * 100;
    const deltaCovers = previousDay.covers
      ? ((kpis.covers - previousDay.covers) / previousDay.covers) * 100
      : null;
    const arrow = (n) => (n >= 0 ? '▲' : '▼');
    const color = (n) => (n >= 0 ? '#16a34a' : '#ef4444');

    const coversText = deltaCovers === null
      ? ''
      : ` · Tickets <span style="color:${color(deltaCovers)};">${arrow(deltaCovers)} ${Math.abs(deltaCovers).toFixed(1)}%</span>`;

    return `<p><small>vs. ${previousDay.date}: <span style="color:${color(deltaSales)};">${arrow(deltaSales)} ${Math.abs(deltaSales).toFixed(1)}%</span> en ventas${coversText}</small></p>`;
  }

  formatWeeklyHTML(metrics, dailyBreakdown = null) {
    const { kpis, health, alerts, period } = metrics;

    let dailyHTML = '';
    if (dailyBreakdown && dailyBreakdown.length > 0) {
      const rows = dailyBreakdown.map((d) => `
        <tr>
          <td>${d.date}</td>
          <td>$${d.grossSales.toLocaleString('es-MX')}</td>
          <td>${d.covers}</td>
          <td>$${d.avgTicket}</td>
        </tr>
      `).join('');

      dailyHTML = `
        <p><strong>Ventas por día:</strong></p>
        <table>
          <thead><tr><th>Día</th><th>Ventas</th><th>Tickets</th><th>Ticket promedio</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <hr>
      `;
    }

    let alertsHTML = '';
    if (alerts.length > 0) {
      alertsHTML = `
        <p><strong style="color:#ef4444;">⚠️ Alertas:</strong></p>
        <ul>${alerts.map((a) => `<li><strong>${a.metric}:</strong> ${a.message} → ${a.action}</li>`).join('')}</ul>
      `;
    }

    const cogsText = kpis.cogsPercentage === null
      ? 'sin datos (falta cargar costo por producto en Fudo)'
      : `${kpis.cogsPercentage}% (target 28-35%) ${health.cogsPercentage?.status === 'healthy' ? '✓' : '⚠️'}`;

    const laborText = kpis.laborPercentage === null
      ? 'sin datos (falta costo de nómina del período)'
      : `${kpis.laborPercentage}% (target 20-28%) ${health.laborPercentage?.status === 'healthy' ? '✓' : '⚠️'}`;

    return `
      <h3>📊 Reporte Instinto — ${period.start} al ${period.end}</h3>
      <p><strong>Ventas Brutas:</strong> $${kpis.grossSales.toLocaleString('es-MX')}</p>
      <p><strong>Número de Tickets:</strong> ${kpis.covers}</p>
      <p><strong>Ticket Promedio:</strong> $${kpis.averageCheck}</p>
      <hr>
      ${dailyHTML}
      <p><strong>COGS %:</strong> ${cogsText}</p>
      <p><strong>Labor %:</strong> ${laborText}</p>
      ${alertsHTML}
      <p><small>Generado automáticamente por Instinto POS Dashboard</small></p>
    `;
  }
}

module.exports = BasecampIntegration;
