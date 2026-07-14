# 🔄 Handoff — Sesión Control de Restaurante Instinto

Contexto para retomar en VSCode con Claude Code.

## Objetivo
Control diario/semanal del restaurante Instinto: extraer ventas de Fudo (POS),
cruzar con facturas de proveedores (Google Drive) y ventas manuales (Basecamp),
y calcular KPIs (COGS, márgenes, punto de equilibrio, meseros, domicilios).

## Estado actual
- ✅ Sistema completo construido en `fudo-extractor/` (cliente, schedulers, dashboard, integraciones)
- ✅ Rama: `claude/restaurant-control-analysis-fkq7rv` — PR #1
- ✅ Autenticación de Fudo corregida (ver abajo)
- ⏳ FALTA: validar `npm run test` contra Fudo real y ver primeros datos

## El bug que resolvimos (causa raíz del 401)
Fudo **NO** acepta el `apiSecret` directo como Bearer token.
Flujo correcto (ya implementado en `src/fudo-client.js`):
1. `POST /auth` con `{ apiKey, apiSecret }` → devuelve un `token`
2. Usar `Authorization: Bearer <token>` en `GET /sales`, etc.
- Base URL: `https://api.fu.do/v1alpha1`
- El token vence a 24h (el cliente lo renueva solo)

## Credenciales (van SOLO en `.env` local, nunca al repo)
- `FUDO_API_KEY` — visible en Fudo: Administración > Usuarios (admin@instinto)
- `FUDO_API_SECRET` — se **regenera** en Fudo (botón "Restablecer"); solo se muestra 1 vez.
  Si `npm run test` da 401, regenerar y actualizar `.env`.

## Primeros pasos al abrir en VSCode
```bash
cd ~/Desktop/instinto-admin/fudo-extractor
git checkout -- src/test-fudo.js   # descartar ediciones manuales que bloquean el pull
git pull origin claude/restaurant-control-analysis-fkq7rv
npm install
npm run test                        # debe autenticar y traer /sales
```
Si `npm run test` autentica pero `/sales` falla, el endpoint puede diferir:
confirmar rutas exactas en https://dev.fu.do/api

## Componentes
- `src/fudo-client.js` — cliente API (auth + endpoints + cálculo COGS)
- `src/index.js` — extracción manual
- `src/schedulers/daily-sync.js` — sync diario 23:55
- `src/schedulers/weekly-report.js` — reporte semanal lunes 08:00
- `src/integrations/google-drive-sync.js` — sube reportes a Drive
- `src/integrations/basecamp-sync.js` — publica resumen en Basecamp
- `dashboard.html` — dashboard visual (datos de ejemplo hasta conectar Fudo)

## Notas
- Vercel CI falla con "Account is blocked" — infra del usuario, NO del código. Ignorar.
- Facturas Drive: carpeta raíz `1JVBd0x-pT3DjA7pbk4PM0_u72HM0m1Nz`, subcarpetas por mes/semana/proveedor, PDFs CFDI con texto (no requieren OCR).
- Basecamp ventas: cuenta 5484659, bucket 46274090. Suben fotos de tickets manualmente.
