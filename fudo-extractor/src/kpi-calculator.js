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

  static calculateHealth(kpis) {
    const targets = {
      cogsPercentage: { min: 28, max: 35 },
      laborPercentage: { min: 20, max: 28 },
      primeCostPercentage: { min: 55, max: 65 },
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

    return health;
  }

  static generateAlerts(kpis, health) {
    const alerts = [];

    if (health.cogsPercentage?.status === 'alert') {
      alerts.push({
        level: 'high',
        metric: 'COGS',
        message: `Food cost en ${kpis.cogsPercentage}% (objetivo 28-35%)`,
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

    if (health.primeCostPercentage?.status === 'alert') {
      alerts.push({
        level: 'critical',
        metric: 'Prime Cost',
        message: `Prime cost en ${kpis.primeCostPercentage}% (objetivo 55-65%)`,
        action: 'Crítico: revisar costo de insumos y labor juntos',
      });
    }

    return alerts;
  }
}

module.exports = KPICalculator;
