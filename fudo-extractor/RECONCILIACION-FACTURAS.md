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

### Fuente de correos
Ya hay acceso a Gmail conectado en esta sesión. Dos formas de localizar las
facturas, de más a menos confiable:
- **Lista de remitentes conocidos por proveedor** (la más confiable —
  evita falsos positivos de correos que no son facturas). Requiere que
  Carlos confirme el correo de facturación de cada proveedor recurrente.
- Búsqueda por palabras clave (`factura`, `CFDI`, `nota de remisión`) +
  adjunto PDF/XML, como respaldo para proveedores no mapeados.

Como ya se documentó en el handoff anterior, los CFDI que maneja Instinto
traen texto extraíble (no son escaneados), así que no hace falta OCR —
alcanza con parsear el PDF o, mejor, el XML adjunto (más confiable que el
PDF para monto/folio exactos).

### Dónde vive el resultado
Se puede agregar como una sub-sección más del reporte semanal de los lunes
(mismo Basecamp donde ya cae "Gastos de la semana"), con tres bloques:
facturas de correo sin capturar en Fudo, gastos de Fudo sin factura de
correo encontrada, y conciliados. Encaja en la cadencia que ya existe en
vez de crear un canal nuevo.

## 4. Siguiente paso — necesita tu confirmación antes de construirse

Falta implementar la parte de correo (`src/integrations/gmail-reconciliation.js`
o similar). Antes de tocar el buzón real necesito que confirmes:

1. **Lista de proveedores de materia prima y su correo de facturación**
   (al menos los principales — pan, carne, pollo). Sin esto, la búsqueda
   por palabras clave va a traer falsos positivos/negativos.
2. **¿Todas las facturas de esos proveedores llegan por correo**, o hay
   proveedores que solo dejan nota física en la entrega (esos nunca van a
   tener match de correo, y no debe reportarse como error)?
3. Confirmar que quieres que el bot **lea** el buzón de facturas
   automáticamente cada lunes (búsqueda + lectura de adjuntos) — es una
   acción sobre tu correo real, así que prefiero construirlo con tu
   confirmación explícita en vez de asumir alcance.

Con esas tres respuestas puedo implementar el matching y agregarlo al
reporte de los lunes.
