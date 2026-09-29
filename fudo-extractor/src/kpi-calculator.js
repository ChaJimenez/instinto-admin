class KPICalculator {
  /**
   * Calcula los KPIs principales para Instinto a partir de ventas ya normalizadas
   * (ver FudoClient.getSales()) y del resultado de FudoClient.calculateCOGS().
   *
   * Labor % y COGS % dependen de datos que Fudo no siempre tiene cargados
   * (costo por producto, nómina). Cuando faltan, el KPI queda en `null` en vez
   * de mostrar un número inventado — mejor decir "sin datos" que mentir.
   *
   * @param {Array} sales - ventas normalizadas (FudoClient.getSales)
   * @param {Object} cogsResult - resultado de FudoClient.calculateCOGS(sales)
   * @param {number|null} manualLaborCost - costo de labor del período, si se conoce
   *   (Fudo no expone nómina; hay que darlo a mano o de otra fuente)
   * @param {Object} period - { start, end }
   */
  static calculate(sales, cogsResult, manualLaborCost, period) {
    const metrics = {
      timestamp: new Date().toISOString(),
      period,
      kpis: {},
      health: {},
      alerts: [],
    };

    metrics.kpis.grossSales = this.calculateGrossSales(sales);
    metrics.kpis.covers = sales.length;
    metrics.kpis.averageCheck = this.calculateAverageCheck(
      metrics.kpis.grossSales,
      metrics.kpis.covers
    );

    metrics.kpis.cogsPercentage = cogsResult.cogsPercentage; // ya viene null si faltan datos
    metrics.kpis.cogsDataMissing = cogsResult.costDataMissing;

    metrics.kpis.laborPercentage = this.calculateLaborPercentage(
      manualLaborCost,
      metrics.kpis.grossSales
    );

    metrics.kpis.primeCostPercentage =
      metrics.kpis.cogsPercentage !== null && metrics.kpis.laborPercentage !== null
        ? Number((metrics.kpis.cogsPercentage + metrics.kpis.laborPercentage).toFixed(2))
        : null;

    metrics.kpis.revpash = this.calculateRevPASH(metrics.kpis.grossSales);

    metrics.health = this.calculateHealth(metrics.kpis);
    metrics.alerts = this.generateAlerts(metrics.kpis, metrics.health);

    return metrics;
  }

  static calculateGrossSales(sales = []) {
    return sales.reduce((sum, sale) => sum + (sale.total || 0), 0);
  }

  static calculateAverageCheck(grossSales, covers) {
    if (covers === 0) return 0;
    return Number((grossSales / covers).toFixed(2));
  }

  static calculateLaborPercentage(manualLaborCost, grossSales) {
    if (manualLaborCost === null || manualLaborCost === undefined) return null;
    if (grossSales === 0) return 0;
    return Number(((manualLaborCost / grossSales) * 100).toFixed(2));
  }

  static calculateRevPASH(grossSales, seatsAvailable = 30, hoursOperating = 8) {
    if (seatsAvailable === 0 || hoursOperating === 0) return 0;
    return Number((grossSales / (seatsAvailable * hoursOperating)).toFixed(2));
  }

  // Metas de un burger restaurant independiente, sucursal única, según
  // benchmarks de industria documentados en
  // reports/Control operativo restaurantes exitosos.md (RestaurantOwner.com,
  // Toast, restaurantinventorytools.com): food cost 28-32%, prime cost
  // 55-60% con 65% como alerta moderada y 70%+ como alerta seria.
  static calculateHealth(kpis) {
    const targets = {
      cogsPercentage: { min: 28, max: 32 },
      laborPercentage: { min: 20, max: 28 },
    };

    const health = {};

    Object.entries(targets).forEach(([metric, range]) => {
      const value = kpis[metric];
      if (value === null || value === undefined) {
        health[metric] = { status: 'no_data', message: 'Sin datos suficientes' };
        return;
      }
      if (value < range.min) {
        health[metric] = { status: 'good', message: `Debajo del objetivo (${value}%)` };
      } else if (value <= range.max) {
        health[metric] = { status: 'healthy', message: `Dentro de rango (${value}%)` };
      } else {
        health[metric] = { status: 'alert', message: `Por encima del objetivo (${value}%)` };
      }
    });

    health.primeCostPercentage = this.evaluatePrimeCost(kpis.primeCostPercentage);

    return health;
  }

  static evaluatePrimeCost(value) {
    if (value === null || value === undefined) {
      return { status: 'no_data', message: 'Sin datos suficientes' };
    }
    if (value < 55) return { status: 'good', message: `Debajo del objetivo (${value}%)` };
    if (value <= 60) return { status: 'healthy', message: `Dentro de rango (${value}%)` };
    if (value <= 65) return { status: 'warning', message: `Alerta moderada (${value}%)` };
    return { status: 'alert', message: `Alerta seria (${value}%)` };
  }

  static generateAlerts(kpis, health) {
    const alerts = [];

    if (health.cogsPercentage?.status === 'alert') {
      alerts.push({
        level: 'high',
        metric: 'COGS',
        message: `Food cost en ${kpis.cogsPercentage}% (objetivo 28-32%)`,
        action: 'Revisar porciones y merma',
      });
    }

    if (health.laborPercentage?.status === 'alert') {
      alerts.push({
        level: 'high',
        metric: 'Labor Cost',
        message: `Labor en ${kpis.laborPercentage}% (objetivo 20-28%)`,
        action: 'Revisar niveles de personal',
      });
    }

    if (health.primeCostPercentage?.status === 'warning') {
      alerts.push({
        level: 'medium',
        metric: 'Prime Cost',
        message: `Prime cost en ${kpis.primeCostPercentage}% (objetivo 55-60%, alerta moderada desde 60%)`,
        action: 'Revisar costo de insumos y labor juntos antes de que escale',
      });
    }

    if (health.primeCostPercentage?.status === 'alert') {
      alerts.push({
        level: 'critical',
        metric: 'Prime Cost',
        message: `Prime cost en ${kpis.primeCostPercentage}% (objetivo 55-60%, alerta seria desde 70%)`,
        action: 'Crítico: revisar costo de insumos y labor juntos',
      });
    }

    return alerts;
  }

  /**
   * Compara los KPIs de la semana actual contra hasta 3 referencias
   * recomendadas por la práctica de la industria (evita confundir ruido
   * estacional con una tendencia real): semana anterior, promedio móvil de
   * 4 semanas, y mismo periodo del año pasado (±3 días de tolerancia sobre
   * weekStart, porque las semanas no caen siempre en la misma fecha exacta
   * año contra año).
   *
   * @param {Object} currentKpis - metrics.kpis de la semana actual
   * @param {Array} pastReports - reportes semanales previos (weeklyReport
   *   completos, más reciente primero), tal como se guardan/suben cada lunes
   * @param {Object} period - { start, end } de la semana actual (YYYY-MM-DD)
   */
  static calculateHistoricalComparison(currentKpis, pastReports = [], period) {
    const sorted = [...pastReports]
      .filter((r) => r?.metrics?.kpis && r.weekStart)
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart));

    const diff = (current, past) =>
      current === null || current === undefined || past === null || past === undefined
        ? null
        : Number((current - past).toFixed(2));

    const previous = sorted[0] || null;
    const previousWeek = previous
      ? {
          weekStart: previous.weekStart,
          grossSalesDelta: diff(currentKpis.grossSales, previous.metrics.kpis.grossSales),
          primeCostPercentageDelta: diff(
            currentKpis.primeCostPercentage,
            previous.metrics.kpis.primeCostPercentage
          ),
        }
      : null;

    const last4 = sorted.slice(0, 4);
    const avg = (values) => {
      const clean = values.filter((v) => v !== null && v !== undefined);
      return clean.length > 0
        ? Number((clean.reduce((sum, v) => sum + v, 0) / clean.length).toFixed(2))
        : null;
    };
    const fourWeekAvg =
      last4.length > 0
        ? {
            weeksIncluded: last4.length,
            avgGrossSales: avg(last4.map((r) => r.metrics.kpis.grossSales)),
            avgPrimeCostPercentage: avg(last4.map((r) => r.metrics.kpis.primeCostPercentage)),
          }
        : null;

    let sameWeekLastYear = null;
    if (period?.start) {
      const targetDate = new Date(`${period.start}T00:00:00Z`);
      targetDate.setUTCFullYear(targetDate.getUTCFullYear() - 1);
      const match = sorted.find((r) => {
        const reportDate = new Date(`${r.weekStart}T00:00:00Z`);
        const diffDays = Math.abs((reportDate - targetDate) / (24 * 60 * 60 * 1000));
        return diffDays <= 3;
      });
      if (match) {
        sameWeekLastYear = {
          weekStart: match.weekStart,
          grossSalesDelta: diff(currentKpis.grossSales, match.metrics.kpis.grossSales),
          primeCostPercentageDelta: diff(
            currentKpis.primeCostPercentage,
            match.metrics.kpis.primeCostPercentage
          ),
        };
      }
    }

    return { previousWeek, fourWeekAvg, sameWeekLastYear };
  }
}

module.exports = KPICalculator;
