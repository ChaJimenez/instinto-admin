# 🍔 Instinto — Dashboard Operativo

Dashboard en tiempo real de KPIs para Instinto Hamburguesas, integrado con **Fudo POS**, **Google Drive** y **Basecamp**.

---

## 🚀 Inicio Rápido

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar variables de entorno
El archivo `.env` ya tiene las credenciales básicas:

```env
FUDO_API_KEY=MUAzNjQ4NTM=
FUDO_API_SECRET=hOXBBDMfjsOdJBjIgKnt1yMEKvt50JFr
FUDO_BASE_URL=https://api.fudoapp.com
GOOGLE_DRIVE_FOLDER_ID=1JVBd0x-pT3DjA7pbk4PM0_u72HM0m1Nz
BASECAMP_ACCOUNT_ID=5484659
BASECAMP_BUCKET_ID=46274090
BASECAMP_MESSAGE_ID=10054352938
```

**Falta completar:**
- `GOOGLE_DRIVE_TOKEN` — token OAuth de Google Drive
- `BASECAMP_TOKEN` — token de Basecamp 3 API

### 3. Iniciar el servidor
```bash
npm run dashboard
```

Dashboard disponible en: **http://localhost:3000/dashboard**

---

## 📊 KPIs Monitorados (6 principales)

| KPI | Métrica | Target | ¿Qué significa? |
|-----|---------|--------|-----------------|
| **Ventas Brutas** | $ | $5k-$20k/día | Ingresos totales sin descontar costos |
| **Número de Órdenes** | unidades | 50-200/día | Tráfico de clientes |
| **Ticket Promedio** | $/orden | $80-$150 | Venta promedio por cliente |
| **COGS %** | % venta | 28-35% | Costo de ingredientes (CRÍTICO si ↑) |
| **Labor %** | % venta | 20-28% | Costo de nómina |
| **Prime Cost %** | % venta | 55-65% | COGS + Labor (métrica más importante) |

---

## 🔌 Integraciones

### Google Drive
Cada **viernes** se guarda un reporte JSON en la carpeta de Instinto:
```
Carpeta: /instinto-admin/reports/
Archivo: instinto-report-2026-07-13.json
```

**Requisito:** obtener token OAuth de Google Drive
```bash
# Generar credenciales en: https://console.cloud.google.com/
# 1. Crear proyecto "Instinto Dashboard"
# 2. OAuth 2.0 Client ID (Application type: Desktop app)
# 3. Guardar token en .env como GOOGLE_DRIVE_TOKEN
```

### Basecamp
Cada **actualización de datos**, se publica en Basecamp (en el proyecto especificado):
```
Cuenta: 5484659
Proyecto: 46274090
```

**Requisito:** obtener token de Basecamp 3
```bash
# 1. Ir a https://launchpad.37signals.com/integrations
# 2. Crear "Personal Access Token"
# 3. Guardar en .env como BASECAMP_TOKEN
```

---

## 🛠️ API Endpoints

### GET `/api/metrics`
Retorna los KPIs calculados desde Fudo:

```json
{
  "timestamp": "2026-07-13T14:30:00.000Z",
  "period": {
    "start": "2026-07-06",
    "end": "2026-07-13"
  },
  "kpis": {
    "grossSales": 75000,
    "covers": 320,
    "averageCheck": 234.375,
    "cogsPercentage": 31.5,
    "laborPercentage": 22.3,
    "primeCostPercentage": 53.8,
    "revpash": 39.06
  },
  "health": {
    "cogsPercentage": { "status": "healthy", "message": "Within range (31.5%)" },
    "laborPercentage": { "status": "healthy", "message": "Within range (22.3%)" },
    "primeCostPercentage": { "status": "healthy", "message": "Within range (53.8%)" }
  },
  "alerts": []
}
```

### GET `/api/status`
Health check del servidor:

```json
{
  "status": "ok",
  "timestamp": "2026-07-13T14:30:00.000Z",
  "cached": true,
  "lastUpdate": "2026-07-13T14:15:00.000Z"
}
```

---

## 💾 Caching

- Los datos se cachean por **15 minutos**
- El dashboard actualiza cada **4 horas** desde Fudo
- Google Drive: guarda cada **viernes**
- Basecamp: actualiza en **cada sincronización**

---

## 🧪 Probar con Datos Demo

Si quieres ver el dashboard con datos sin conectar a Fudo:

```bash
# Añadir esta línea al server.js (línea 50, después de cachedMetrics):
cachedMetrics = {
  timestamp: new Date().toISOString(),
  period: { start: '2026-07-06', end: '2026-07-13' },
  kpis: {
    grossSales: 75000,
    covers: 320,
    averageCheck: 234.38,
    cogsPercentage: '31.5',
    laborPercentage: '22.3',
    primeCostPercentage: '53.8'
  },
  health: {
    cogsPercentage: { status: 'healthy' },
    laborPercentage: { status: 'healthy' },
    primeCostPercentage: { status: 'healthy' }
  },
  alerts: []
};
```

---

## 📋 Próximos Pasos

- [ ] Obtener Google Drive OAuth token
- [ ] Obtener Basecamp API token
- [ ] Probar conexión con Fudo (puede que necesite IP whitelisting)
- [ ] Configurar auto-sync cada 4 horas
- [ ] Crear alertas por Slack (opcional)

---

## 🐛 Troubleshooting

**Problema:** El dashboard muestra 0 en todos los KPIs  
→ Verifica que Fudo API está respondiendo: `curl https://api.fudoapp.com/ping`

**Problema:** Error "Cannot GET /dashboard"  
→ Asegúrate que el servidor está corriendo: `npm run dashboard`

**Problema:** Google Drive integration no funciona  
→ Verifica que `GOOGLE_DRIVE_TOKEN` está en `.env`

**Problema:** Basecamp no actualiza  
→ Verifica que `BASECAMP_TOKEN` está en `.env`

---

## 📞 Contacto & Soporte

Para preguntas o issues:
- Documentación: `README-DASHBOARD.md`
- Code: `/src/kpi-calculator.js` (lógica de KPIs)
- UI: `/public/dashboard.html` (interfaz)

---

**Última actualización:** 13 de julio, 2026  
**Versión:** 1.0.0 (Elite Dashboard Edition)
