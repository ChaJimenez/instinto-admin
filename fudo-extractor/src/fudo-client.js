const axios = require('axios');

const PAGE_SIZE = 250;

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
   * El login vive en un host distinto al de datos: https://auth.fu.do/api
   * (confirmado contra la documentación real; api.fu.do/v1alpha1/auth no existe).
   * El token vence a las 24h; lo renovamos cuando falta poco.
   */
  async authenticate() {
    const now = Date.now();
    if (this.token && now < this.tokenExpiresAt - 5 * 60 * 1000) {
      return this.token;
    }

    try {
      const response = await axios.post('https://auth.fu.do/api', {
        apiKey: this.apiKey,
        apiSecret: this.apiSecret,
      }, {
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      });

      const token = response.data?.token;
      if (!token) {
        throw new Error(
          `Respuesta de auth.fu.do sin token: ${JSON.stringify(response.data).substring(0, 200)}`
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
      if (status === 404) hint = ' → endpoint auth.fu.do/api no responde (revisar ruta de login)';
      throw new Error(
        `Fallo de autenticación [POST https://auth.fu.do/api] ${status || ''}${hint}` +
        (body ? ` | ${JSON.stringify(body).substring(0, 200)}` : ` | ${error.message}`)
      );
    }
  }

  /**
   * Realiza request autenticado a Fudo. Reintenta una vez si el token expiró.
   */
  async request(method, endpoint) {
    const token = await this.authenticate();
    try {
      const response = await this.client({
        method,
        url: endpoint,
        headers: { 'Authorization': `Bearer ${token}` },
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        this.token = null;
        const freshToken = await this.authenticate();
        const retry = await this.client({
          method,
          url: endpoint,
          headers: { 'Authorization': `Bearer ${freshToken}` },
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

  /**
   * Trae todas las páginas de un endpoint JSON:API y junta data + included.
   */
  async fetchAllPages(path) {
    const allData = [];
    const allIncluded = [];
    let page = 1;

    while (true) {
      const sep = path.includes('?') ? '&' : '?';
      const pageUrl = `${path}${sep}page[size]=${PAGE_SIZE}&page[number]=${page}`;
      const response = await this.request('GET', pageUrl);
      const data = response?.data || [];
      allData.push(...data);
      if (response?.included) allIncluded.push(...response.included);

      if (data.length < PAGE_SIZE) break;
      page += 1;
      if (page > 100) break; // salvaguarda ante loops infinitos
    }

    return { data: allData, included: allIncluded };
  }

  /**
   * Busca un recurso dentro de "included" por type + id.
   */
  static findIncluded(included, ref) {
    if (!ref) return null;
    return included.find((i) => i.type === ref.type && i.id === ref.id) || null;
  }

  /**
   * Obtiene ventas en un rango de fechas, con items/productos/mesero/pagos/propinas resueltos.
   * Fudo NO tiene endpoint de "orders": las ventas y órdenes son el mismo recurso: /sales.
   * Filtro de fecha confirmado: filter[createdAt]=and(gte.YYYY-MM-DD,lte.YYYY-MM-DD)
   *
   * Fudo filtra por día calendario en UTC, pero el día de negocio de Instinto
   * es CDMX (UTC-6) — las ventas después de ~18:00 hora local ya caen del lado
   * de "mañana" en UTC. Por eso pedimos colchón de cada lado del rango y luego
   * filtramos con precisión por el día calendario CDMX real de cada venta
   * (closedAt/createdAt), en vez de confiar en el filtro del servidor.
   *
   * OJO: Fudo trata `lte.YYYY-MM-DD` como `<= YYYY-MM-DDT00:00:00Z` (el INICIO
   * de ese día, no el final). Un colchón de +1 día en `queryEnd` solo cubre
   * hasta las 00:00 UTC del día siguiente — pero las ventas CDMX de la tarde/
   * noche (después de ~18:00 local) caen entre las 00:00 y 06:00 UTC del día
   * SIGUIENTE. Con +1 día esas ventas ni siquiera las devuelve la API (no es
   * que el filtro del cliente las descarte). Confirmado con datos reales del
   * 9 de sept: con +1 día se perdían las 9 ventas después de las 18:24 CDMX.
   * Por eso el colchón de `queryEnd` es de +2 días, no +1.
   */
  async getSales(startDate = new Date(), endDate = new Date()) {
    const localStart = this.formatDate(startDate);
    const localEnd = this.formatDate(endDate);

    const queryStart = this.formatDate(new Date(startDate.getTime() - 24 * 60 * 60 * 1000));
    const queryEnd = this.formatDate(new Date(endDate.getTime() + 48 * 60 * 60 * 1000));
    const filter = encodeURIComponent(`and(gte.${queryStart},lte.${queryEnd})`);
    const path = `/sales?filter[createdAt]=${filter}&include=items.product,waiter,payments,tips`;

    const { data, included } = await this.fetchAllPages(path);
    const sales = data.map((sale) => this.normalizeSale(sale, included));

    return sales.filter((sale) => {
      const day = this.localDateOf(sale.closedAt || sale.createdAt);
      return day !== null && day >= localStart && day <= localEnd;
    });
  }

  normalizeSale(sale, included) {
    const attrs = sale.attributes || {};
    const rel = sale.relationships || {};

    const waiterRef = rel.waiter?.data;
    const waiter = FudoClient.findIncluded(included, waiterRef);

    const itemRefs = rel.items?.data || [];
    const items = itemRefs
      .map((ref) => FudoClient.findIncluded(included, ref))
      .filter(Boolean)
      .map((item) => this.normalizeItem(item, included));

    const tipRefs = rel.tips?.data || [];
    const tips = tipRefs
      .map((ref) => FudoClient.findIncluded(included, ref))
      .filter(Boolean)
      .reduce((sum, t) => sum + (t.attributes?.amount || 0), 0);

    return {
      id: sale.id,
      createdAt: attrs.createdAt,
      closedAt: attrs.closedAt,
      total: attrs.total || 0,
      people: attrs.people || 0,
      saleType: attrs.saleType,
      saleState: attrs.saleState,
      waiterId: waiter?.id || null,
      waiterName: waiter?.attributes?.name || 'Sin asignar',
      items,
      tips,
    };
  }

  normalizeItem(item, included) {
    const attrs = item.attributes || {};
    const productRef = item.relationships?.product?.data;
    const product = FudoClient.findIncluded(included, productRef);

    return {
      id: item.id,
      productId: product?.id || null,
      productName: product?.attributes?.name || 'Producto desconocido',
      price: attrs.price || 0,
      quantity: attrs.quantity || 1,
      cost: product?.attributes?.cost ?? null,
      canceled: !!attrs.canceled,
    };
  }

  /**
   * Catálogo de productos. Endpoint confirmado: GET /products
   */
  async getProducts() {
    const { data } = await this.fetchAllPages('/products');
    return data.map((p) => ({
      id: p.id,
      name: p.attributes?.name,
      price: p.attributes?.price || 0,
      cost: p.attributes?.cost ?? null,
      active: p.attributes?.active,
    }));
  }

  /**
   * Insumos (ingredientes). Endpoint confirmado: GET /ingredients
   * (no /supplies, /stocks ni /inventories — esos dan 404).
   * `minStock` es el umbral de alerta configurado a mano por insumo en Fudo;
   * viene `null` si nunca se llenó, y en ese caso no hay contra qué comparar.
   */
  async getIngredients() {
    const { data, included } = await this.fetchAllPages('/ingredients?include=ingredientCategory');
    return data.map((ing) => {
      const attrs = ing.attributes || {};
      const categoryRef = ing.relationships?.ingredientCategory?.data;
      const category = FudoClient.findIncluded(included, categoryRef);
      return {
        id: ing.id,
        name: attrs.name,
        cost: attrs.cost ?? null,
        stock: attrs.stock ?? null,
        minStock: attrs.minStock ?? null,
        stockControl: !!attrs.stockControl,
        categoryName: category?.attributes?.name || null,
      };
    });
  }

  /**
   * Insumos en riesgo, calculado del lado del cliente a partir de getIngredients().
   * Dos categorías, porque significan cosas distintas:
   * - `negative`: stock < 0 — no es "bajo stock", es un inventario roto (conteo
   *   inicial nunca cargado, o desajuste de unidades receta/compra). Se reporta
   *   siempre, sin importar si hay minStock configurado.
   * - `low`: stock <= minStock configurado. Se omite si stockControl es false
   *   o si minStock es null (no hay umbral contra qué comparar).
   */
  static calculateLowStock(ingredients) {
    const tracked = ingredients.filter((i) => i.stockControl && i.stock !== null);

    const negative = tracked.filter((i) => i.stock < 0);
    const low = tracked.filter(
      (i) => i.stock >= 0 && i.minStock !== null && i.stock <= i.minStock
    );
    const missingThreshold = tracked.filter((i) => i.minStock === null);

    return { negative, low, missingThreshold };
  }

  /**
   * Empleados/usuarios. En Fudo se llaman "users", no "employees".
   * Endpoint confirmado: GET /users
   */
  async getEmployees() {
    const { data } = await this.fetchAllPages('/users');
    return data.map((u) => ({
      id: u.id,
      name: u.attributes?.name,
      email: u.attributes?.email,
      active: u.attributes?.active,
    }));
  }

  /**
   * Métricas por mesero, calculadas del lado del cliente a partir de ventas ya traídas.
   * No existe endpoint /api/analytics/waiters en Fudo — se deriva de getSales().
   */
  static calculateWaiterMetrics(sales) {
    const map = {};

    sales.forEach((sale) => {
      const key = sale.waiterId || 'unknown';
      if (!map[key]) {
        map[key] = { name: sale.waiterName, tickets: 0, totalSales: 0, tips: 0 };
      }
      map[key].tickets += 1;
      map[key].totalSales += sale.total;
      map[key].tips += sale.tips;
    });

    return Object.values(map)
      .map((w) => ({ ...w, avgTicket: w.tickets > 0 ? (w.totalSales / w.tickets) : 0 }))
      .sort((a, b) => b.totalSales - a.totalSales);
  }

  // ==================== HELPERS ====================

  /**
   * Día calendario en hora de Ciudad de México (UTC-6 fijo desde que México
   * eliminó el horario de verano en la mayor parte del país). NO usar
   * toISOString() aquí: convierte a UTC y corre la fecha un día para
   * cualquier venta cerrada después de ~18:00 hora local.
   */
  formatDate(date) {
    return date.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }); // YYYY-MM-DD
  }

  /**
   * Día calendario CDMX de cualquier timestamp ISO de Fudo (closedAt/createdAt).
   */
  localDateOf(isoString) {
    if (!isoString) return null;
    return new Date(isoString).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  }

  /**
   * Calcula COGS (Costo de Bienes Vendidos) a partir de ventas normalizadas.
   * Fudo no siempre trae `cost` cargado por producto: cuando falta, el ítem
   * se excluye de la suma y se reporta cuántos se excluyeron en vez de fingir un número.
   */
  calculateCOGS(sales) {
    let totalCost = 0;
    let totalSales = 0;
    let itemsWithoutCost = 0;
    let itemsTotal = 0;

    sales.forEach((sale) => {
      sale.items.forEach((item) => {
        if (item.canceled) return;
        itemsTotal += 1;
        totalSales += item.quantity * item.price;
        if (item.cost === null || item.cost === undefined) {
          itemsWithoutCost += 1;
        } else {
          totalCost += item.quantity * item.cost;
        }
      });
    });

    // Si a más del 10% de los ítems les falta costo, el % de COGS no es
    // confiable (no es una muestra representativa del menú) — mejor "sin datos"
    // que un número que parece preciso y no lo es.
    const missingRatio = itemsTotal > 0 ? itemsWithoutCost / itemsTotal : 1;
    const costDataMissing = itemsTotal === 0 || missingRatio > 0.1;

    return {
      totalCost,
      totalSales,
      cogsPercentage: costDataMissing || totalSales === 0
        ? null
        : Number(((totalCost / totalSales) * 100).toFixed(2)),
      itemsWithoutCost,
      itemsTotal,
      costDataMissing,
    };
  }
}

module.exports = FudoClient;
