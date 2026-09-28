# Conciliación de facturas (correo) vs. entregas (Fudo)

Investigación de mejores prácticas + diseño propuesto para Instinto. Es el
"segundo paso" pedido: cómo cruzar las facturas/notas de proveedores que
llegan por correo con lo que se captura como entrega en Fudo (pan, carne,
pollo, etc.).

## 1. Lo que ya existe (implementado en esta sesión)

- `FudoClient.getExpenses()` — trae el módulo **Expenses** de Fudo
  (`/expenses`), que es donde Carlos confirmó que se captura la
  nota/factura y "de inmediato afecta el inventario". Cada gasto trae:
  proveedor, categoría (`GOODS-PURCHASES` = materia prima), líneas
  (`expenseItems`, cada una ligada a un `ingredient` o `product`), monto,
  fecha, estatus de pago, y **`commercialDocument.docUrl`** — el archivo de
  la factura que se adjuntó en Fudo, si se adjuntó.
- `FudoClient.organizeExpenses()` — agrupa por proveedor (materia prima vs.
  otros gastos) y señala dos alertas accionables: gastos **sin factura
  adjunta** en Fudo y gastos **vencidos sin pagar**.
- El reporte semanal de los lunes (`weekly-report.js`, cron `0 8 * * 1`, ya
  existente) ahora incluye esta sección y la publica en Basecamp.

Esto ya resuelve "organizar los gastos registrados cada lunes" usando
únicamente la API de Fudo. Lo que sigue es la parte de correo.

## 2. Mejores prácticas de la industria (three-way matching)

Fuente: [Restaurant365](https://www.restaurant365.com/blog/3-way-invoice-matching/),
[Ramp](https://ramp.com/blog/accounts-payable/3-way-match),
[NetSuite](https://www.netsuite.com/portal/resource/articles/accounting/three-way-matching.shtml),
[Precoro](https://precoro.com/blog/why-implementing-3-way-matching-is-important/).

El estándar de la industria es el **three-way match**: orden de compra (PO)
↔ recepción de mercancía ↔ factura del proveedor. Los tres documentos deben
coincidir en cantidad, precio unitario y total antes de pagar. Puntos clave
aplicables a un restaurante independiente como Instinto:

- **Captura en el momento de recepción, no después.** El punto de fricción
  más común es que la mercancía entra a cocina y la factura se concilia
  días después, cuando ya no hay forma de verificar cantidades. Conciliar
  temprano (mismo día/semana) da margen para resolver diferencias antes del
  cierre de mes y aprovechar descuentos por pronto pago.
- **Numeración única de factura por proveedor.** Es el mecanismo primario
  para detectar duplicados — sin esto, una factura reenviada o pagada dos
  veces pasa desapercibida.
- **Automatizar la captura, no la decisión.** El patrón recomendado es:
  digitalizar la orden/recepción, extraer los datos de la factura (OCR o
  parseo de PDF/XML), correr el match automático, y **solo escalar a un
  humano las excepciones** (diferencias de monto, factura sin recepción,
  recepción sin factura). No se automatiza el pago ni la aprobación.
- Instinto es una operación pequeña sin PO formal — no hay una orden de
  compra previa que emitir. Esto reduce el three-way match a un **two-way
  match reforzado**: factura de correo ↔ gasto capturado en Fudo (que ya
  funciona como "recepción", porque según Carlos capturarlo en Fudo es lo
  que afecta el inventario).

## 3. Diseño propuesto para Instinto

### Qué comparar
Por cada proveedor de materia prima (pan, carne, pollo, etc.) en una
ventana de 7 días:

| Dato | Origen correo | Origen Fudo |
|---|---|---|
| Proveedor | remitente / nombre en el PDF/XML | `expense.providerName` |
| Monto total | total del CFDI/factura | `expense.amount` |
| Folio/No. de factura | folio fiscal / receipt number | `expense.receiptNumber` |
| Fecha | fecha de emisión | `expense.date` |
| Conceptos (opcional, fase 2) | líneas del CFDI | `expense.items[].itemName/quantity` |

### Reglas de match
1. **Match fuerte**: mismo proveedor + mismo folio/receiptNumber → conciliado.
2. **Match por monto+fecha**: mismo proveedor + monto igual (±$1 por
   redondeo) + fecha dentro de ±2 días → conciliado, marcado como
   "sin folio confirmado" para revisión rápida.
3. **Sin match**:
   - Factura en correo **sin** gasto en Fudo → la entrega no se capturó
     (inventario no se actualizó). Esta es la alerta más importante: es
     dinero y stock que no están reflejados.
   - Gasto en Fudo **sin** factura de correo encontrada → puede ser normal
     (proveedor que entrega nota física, no por correo) o una factura que
     se traspapeló — se reporta, no se asume error.
   - Montos que no cuadran entre correo y Fudo con mismo folio → posible
     error de captura, se reporta con el detalle de ambos montos.

### Fuente de correos: Basecamp Forwards, no Gmail
Confirmado por Carlos: los correos de facturas llegan **reenviados a la
herramienta "Forwards" de Basecamp** (no a Gmail) — es lo que revisa todos
los días. El plan original de leer Gmail directamente no aplica; hay que
leer los Forwards del proyecto correspondiente vía el CLI `basecamp` (el
mismo que ya usa `src/integrations/basecamp.js`, autenticado en la máquina
de Carlos).

Como los CFDI que maneja Instinto traen texto extraíble (no son
escaneados, según el handoff anterior), no hace falta OCR — alcanza con
parsear el PDF o, mejor, el XML adjunto al forward (más confiable que el
PDF para monto/folio exactos).

**Pendiente de Carlos** (bloqueante para implementar esta parte): el
proyecto/bucket de Basecamp donde vive la herramienta Forwards que recibe
estos reenvíos — esta sesión no tiene memoria de sesiones anteriores, así
que no hay forma de inferirlo sin ese dato. Con el bucket ID (y el ID de
la herramienta Forwards dentro de ese proyecto, visible en la URL al
abrirla en Basecamp) se puede listar los forwards vía `basecamp` CLI igual
que ya se hace con `messages show/update`.

### "Sin factura" no siempre es un error
Confirmado por Carlos: cuando falla un proveedor y compra de respaldo con
otro que no factura (pasó la semana pasada), eso es válido, no un error de
captura. Por eso el reporte semanal **ya no trata "sin factura adjunta"
como alerta** — quedó como nota informativa de baja prioridad al final de
la sección de gastos (ver `formatExpensesHTML` en
`src/integrations/basecamp.js`), para que Carlos la revise caso por caso
sin que el sistema asuma que es un error.

### Dónde vive el resultado
Se puede agregar como una sub-sección más del reporte semanal de los lunes
(mismo Basecamp donde ya cae "Gastos de la semana"), con tres bloques:
facturas de correo sin capturar en Fudo, gastos de Fudo sin factura de
correo encontrada, y conciliados. Encaja en la cadencia que ya existe en
vez de crear un canal nuevo.

## 4. Estado — configuración resuelta, falta validar y construir el matching

Carlos confirmó la ubicación de los forwards:
https://3.basecamp.com/5484659/buckets/46274090/inboxes/10191373652
→ bucket **46274090** ("Operaciones Instinto", el proyecto viejo — sigue
vivo solo para esto), herramienta Forwards con ID **10191373652**. Ya
configurado en `.env.example` como `BASECAMP_FORWARDS_BUCKET_ID` /
`BASECAMP_FORWARDS_INBOX_ID`, y `BasecampIntegration.listForwards()` /
`.getForward(id)` (en `src/integrations/basecamp.js`) ya apuntan ahí usando
el CLI oficial `basecamp forwards list` / `forwards show` (confirmado
contra la spec de github.com/basecamp/basecamp-cli, ya que ese CLI no está
instalado en este contenedor — solo en la máquina de Carlos).

**Pendiente antes de construir el matching real** (necesita correr en la
máquina de Carlos, donde el CLI sí está autenticado):

1. Correr `listForwards()` una vez contra datos reales y ver la forma
   exacta del JSON que devuelve — en particular cómo vienen los adjuntos
   (¿URL descargable del PDF/XML? ¿contenido inline?) y el asunto/cuerpo
   del correo reenviado. El diseño de matching de la sección 3 asume que
   se puede extraer proveedor/monto/folio de ahí, pero eso no se ha
   verificado contra un forward real todavía.
2. Con eso, escribir el parser (PDF o, mejor, XML del CFDI si el adjunto
   lo trae) y la función de matching contra `FudoClient.getExpenses()`
   descrita en la sección 3.

Ya no hace falta el mapeo de correos por proveedor ni el permiso sobre
Gmail — el punto 3 de la versión anterior de este documento (leer el
buzón directamente) quedó descartado: es Basecamp, no Gmail.
