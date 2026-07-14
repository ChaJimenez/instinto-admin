# 🍽️ Instinto - Extractor de Datos Fudo

Sistema automático de extracción, análisis y reportería de datos desde tu POS Fudo para control integral del restaurante.

## ¿Qué hace?

- ✅ Extrae ventas diarias de Fudo automáticamente
- ✅ Calcula KPIs críticos (COGS, márgenes, punto de equilibrio)
- ✅ Genera reportes semanales
- ✅ Analiza performance de meseros
- ✅ Monitorea costos de insumos
- ✅ Exporta datos a JSON (listo para Basecamp, Google Drive, dashboards)

## 📋 Requisitos

- Node.js 16+
- NPM o Yarn
- API Key + Secret de Fudo (ya habilitados en tu cuenta)

## 🚀 Instalación Rápida

### 1. Configurar credenciales

```bash
cd fudo-extractor
cp .env.example .env
```

Edita `.env` y completa:

```env
FUDO_API_KEY=MUAzNjQ4NTM=
FUDO_API_SECRET=tu_secret_aqui_desde_fudo
FUDO_BASE_URL=https://api.fudoapp.com
```

⚠️ **IMPORTANTE**: Tu `FUDO_API_SECRET` está oculto en la pantalla de Fudo. Cópialo exactamente.

### 2. Instalar dependencias

```bash
npm install
```

### 3. Probar conexión

```bash
npm run test
```

Deberías ver:
```
✅ Conexión OK
```

## 📊 Uso

### Extracción Manual (Una sola vez)

```bash
npm start
```

Genera reporte en: `./data/fudo-report-YYYY-MM-DD.json`

### Sincronización Automática Diaria

```bash
npm run daily
```

Se ejecutará todos los días a las **23:55** automáticamente.

### Reporte Semanal

```bash
npm run weekly
```

Se ejecutará cada **lunes a las 08:00 AM**.

## 📈 KPIs Generados

### Diarios
- Total de órdenes
- Ventas totales
- Ticket promedio
- Productos más vendidos
- Performance de meseros

### Semanales
- **COGS**: Costo de Bienes Vendidos (%)
- **Margen Bruto**: (Ventas - COGS) / Ventas
- **Punto de Equilibrio**: Tickets mínimos diarios para cubrir costos fijos
- **Ganancia Neta**: Ventas - COGS - Costos Fijos
- Análisis de productos rentables vs. con pérdida
- Análisis restaurant vs. domicilios
- Ranking de meseros

## 📁 Estructura de Datos

```
./data/
├── fudo-report-2026-07-13.json      # Extracción inicial
├── daily-2026-07-13.json             # Datos diarios
├── daily-2026-07-12.json
└── weekly-report-2026-W28.json       # Reporte semanal
```

### Ejemplo de estructura JSON

```json
{
  "date": "2026-07-13",
  "stats": {
    "orders": 45,
    "totalSales": 8500,
    "averageTicket": 188.89
  },
  "kpis": {
    "cogs": {
      "total": "2550",
      "percentage": "30%",
      "status": "OK"
    },
    "grossProfit": "5950",
    "grossMargin": "70%"
  },
  "topProducts": [
    {
      "name": "Enchiladas Verdes",
      "quantity": 23,
      "revenue": 1150
    }
  ]
}
```

## 🔌 Integración con Basecamp

Próximamente: Script que sube reportes automáticamente a tu Message Board.

## 🔍 Solución de Problemas

### "ENOTFOUND api.fudoapp.com"
- Verifica conexión a internet
- Comprueba si el firewall bloquea conexiones

### "401 Unauthorized"
- API Key o Secret incorrectos
- Verifica en Fudo settings

### "403 Forbidden"
- Permiso insuficiente
- Contacta a Fudo support

## 📞 Soporte

Para problemas con API de Fudo:
- 📧 Contacta a Fudo: soporte@fudoapp.com
- 📖 Docs: https://intercom.help/fudoapp/es/articles/11939789-api-de-proposito-general

## ⚙️ Configuración Avanzada

### Cambiar horarios de sincronización

En `src/schedulers/daily-sync.js`, línea 50:
```javascript
const scheduledTime = process.env.SYNC_TIME || '55 23 * * *';
```

**Formato CRON**: `minuto hora día mes día-semana`

Ejemplos:
- `0 8 * * *` → Diariamente a las 08:00
- `0 0 * * 0` → Domingos a las 00:00
- `*/15 * * * *` → Cada 15 minutos

### Ajustar costos fijos estimados

En `src/schedulers/weekly-report.js`, línea 95:
```javascript
const estimatedFixedCosts = 5000; // $ por semana
```

---

**Última actualización**: 2026-07-13
**Versión**: 1.0.0
