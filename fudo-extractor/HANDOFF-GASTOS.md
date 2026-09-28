# 🔄 Handoff — Conciliación de Gastos/Facturas Instinto

Contexto para retomar en una nueva conversación de Claude Code.

## Objetivo

Cada lunes, conciliar automáticamente los **gastos/facturas de proveedores**
(pan, carne, pollo, etc. — materia prima) contra lo **capturado como recibido
en Fudo**, y publicar el resultado en Basecamp (mismo patrón que el reporte
semanal de ventas ya existente en `src/schedulers/weekly-report.js`).

Es la continuación de `HANDOFF.md` (que cubre ventas/KPIs, ya resuelto y en
producción) — esto es un flujo nuevo, de gastos, no de ventas.

## Estado actual: investigación de API completa, pendiente decidir enfoque

Se hizo descubrimiento exhaustivo del API de Fudo para gastos (scripts en
`src/discover-*.js`, todos corridos contra la cuenta real). Conclusiones:

### Lo que SÍ funciona por API
- **`/providers`** — proveedores, solo `name`. Confirmado.
- **`/expenses?include=commercialDocument`** — cuando el gasto viene de una
  factura CFDI válida, `commercialDocument` trae el detalle REAL y completo:
  `seller`/`buyer` (RFC), `items[]` con `quantity`, `unitPrice`, `description`,
  `totalAmount` por línea, `status` (`ACCEPTED`/`REJECTED` por el SAT),
  `emissionDate`, `grandTotal`. Esto es oro para conciliar — pero **solo
  aplica a proveedores que facturan fiscal** (ej. Grupo Modelo, gas, software).
  Los proveedores informales de materia prima del día a día (Carnicería
  Mazatlán, verdulerías, Hielo) NO tienen CFDI — `commercialDocument: null`.
- **`/stock-movements`** (con GUION, no `/stockMovements` ni `/stock_movements`
  — ambos dan 404) — existe, con includes válidos confirmados:
  `expense`, `ingredient`, `ingredient.unit`, `item`, `item.sale`, `product`,
  `product.unit`, `user`.

### Lo que NO funciona (pared confirmada, no seguir insistiendo)
- **`Expense`, `ExpenseItem`, `StockMovement` no exponen atributos propios
  por API**, ni en listas ni en `include`, ni vía sparse fieldsets
  (`fields[ExpenseItem]=...` da 400 "schema inválido" — no es un problema de
  nombre de campo, el tipo no admite ese filtro). Osea: **la cantidad, el
  costo y el estado de pago que Carlos captura a mano en "Detalle de
  mercadería" (UI de Fudo) NO se puede leer por API.** Se probaron ~15
  variantes de endpoints/includes/fields, todas documentadas en
  `src/discover-*.js` — no repetir ese trabajo, ya está descartado.
- Endpoints que dan 404 y no existen: `/purchases`, `/purchaseOrders`,
  `/suppliers`, `/invoices`, `/bills`, `/currentAccounts`,
  `/currentAccountMovements`, `/deliveries`, `/remitos`,
  `/ingredientMovements`, `/inventoryMovements`, `/inventoryEvents`.

### Por qué importa (evidencia visual de Carlos, capturas de pantalla)
- En Fudo UI (`app-v2.fu.do/app/#!/expenses`), al registrar un gasto, Carlos
  captura a mano "Detalle de mercadería": insumo + cantidad + costo
  (ej. "4 kg Molida 80/20 $600.00"). Eso SÍ existe y se ve en pantalla —
  simplemente el API general-purpose no lo expone.
- Esa captura genera un evento "Detalle de gasto creado" visible en
  `app-v2.fu.do/app/#!/stock_movements` (Stock anterior/actual/diferencia).
- Ambas pantallas de Fudo tienen botón **"Exportar"** — ese es el camino que
  Fudo sí soporta para sacar estos datos (CSV), no el API.
- Muchos proveedores de Carlos NO facturan fiscal (notas/tickets), así que
  el cruce automático contra CFDI del SAT solo cubre una fracción de los
  gastos reales de materia prima.

## Recomendación (pendiente de confirmar con Carlos)

**Enfoque CSV, no API**, para esta pieza específica:
1. Cada lunes, exportar desde la UI de Fudo 2 CSVs de la semana: **Gastos**
   y **Movimientos de Stock** (filtrado por evento "Detalle de gasto creado").
2. Complementar con las facturas CFDI reales que Carlos sí tenga (correo o
   descarga directa del portal del SAT).
3. Script que lea esos 2 CSVs + XMLs/PDFs de factura, normalice nombres de
   insumo, y cruce: cantidad facturada vs. cantidad capturada como recibida,
   precio facturado vs. costo cargado en el insumo.
4. Reportar discrepancias en Basecamp, mismo patrón que
   `src/integrations/basecamp.js` (bucket 32427345, ver `.env.example`).

Alternativa no explorada: escribirle a soporte de Fudo preguntando si hay
un scope/endpoint distinto que sí exponga `ExpenseItem`/`StockMovement`
(no se intentó — requeriría contacto humano con Fudo, no algo que Claude
pueda hacer directo).

## Para retomar

```bash
cd ~/Desktop/instinto-admin/fudo-extractor
git pull origin claude/quirky-ptolemy-d7l8bz   # o el branch vigente en ese momento
```

Primer paso real: preguntarle a Carlos si prefiere (a) el enfoque CSV, o
(b) contactar a Fudo primero. Sin eso, no construir nada nuevo — ya se
gastó bastante tiempo en descubrimiento, toca decidir y construir, no
seguir explorando el API.

## Otras notas operativas (de la conversación con Carlos)

- Pagos: Carlos los registra en Fudo > Gastos > Pagos (estado "A pagar"/
  "Pagado", con concepto = factura pagada).
- Estados de cuenta bancarios: hilo de Basecamp
  `https://3.basecamp.com/5484659/buckets/46255976/messages/9861031716`.
- Basecamp — corregir en cualquier instrucción vieja: el proyecto
  "Operaciones Instinto" (bucket `46274090`) es VIEJO, ya no se usa. El
  vigente es "Administración" (`32427345`) — ver `.env.example` y
  `src/integrations/basecamp.js`. Ya fue el motivo de un error 404 en esta
  misma sesión (`basecamp forwards list --project 46274090` fallaba;
  corregido a `32427345`, confirmó "674 forwards").

**Última actualización**: 2026-09-28
