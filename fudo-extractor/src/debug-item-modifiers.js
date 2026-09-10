require('dotenv').config();
const FudoClient = require('./fudo-client');

/**
 * Diagnóstico: cómo expone Fudo los modificadores/toppings vendidos por
 * línea de venta (item). El catálogo (productos.xls, hojas "Modificadores -
 * Grupos" y "Modificadores - Productos") confirma que toppings como
 * Aguacate, Chicharrón de queso, Extra carne, etc. viven como modificadores
 * ligados a grupos de modificadores por platillo — pero no sabemos todavía
 * el nombre del `include` ni de la relación en /sales que los trae.
 *
 * Estrategia: probar varios `include` candidatos contra /sales (uno por
 * uno, para que un include inválido no tire toda la petición) y, aparte,
 * sondear endpoints candidatos de modificadores directamente.
 *
 * Uso: node src/debug-item-modifiers.js
 */

const CANDIDATE_INCLUDES = [
  'items.modifiers',
  'items.itemModifiers',
  'items.modifierItems',
  'items.product.modifierGroups',
  'items.selectedModifiers',
  'items.modifiers.modifier',
  'items.addons',
];

const CANDIDATE_ENDPOINTS = [
  '/modifiers',
  '/modifierGroups',
  '/modifier-groups',
  '/productModifiers',
  '/itemModifiers',
];

async function main() {
  const fudo = new FudoClient(
    process.env.FUDO_API_KEY,
    process.env.FUDO_API_SECRET,
    process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1'
  );

  await fudo.authenticate();
  console.log('✅ Autenticado.\n');

  const target = new Date('2026-09-09T12:00:00-06:00');
  const localDate = fudo.formatDate(target);

  console.log('=== Paso 1: probar `include` candidatos contra /sales ===');
  for (const include of CANDIDATE_INCLUDES) {
    const path = `/sales?filter[createdAt]=and(gte.${localDate},lte.${localDate})&include=items.product,${include}&page[size]=3`;
    console.log(`\n--- include=items.product,${include} ---`);
    try {
      const response = await fudo.request('GET', path);
      const includedTypes = [...new Set((response.included || []).map((i) => i.type))];
      console.log('OK — included types:', includedTypes);
      const extraIncluded = (response.included || []).filter(
        (i) => i.type !== 'product' && i.type !== 'waiter' && i.type !== 'payment' && i.type !== 'tip'
      );
      if (extraIncluded.length > 0) {
        console.log('Muestra de included nuevo:', JSON.stringify(extraIncluded[0], null, 2));
      }
    } catch (error) {
      const status = error.response?.status;
      const body = error.response?.data;
      console.log(`✗ Falló (${status || error.message})`);
      if (body) console.log('  detalle:', JSON.stringify(body).substring(0, 300));
    }
  }

  console.log('\n\n=== Paso 2: probar endpoints candidatos directos ===');
  for (const path of CANDIDATE_ENDPOINTS) {
    console.log(`\n=== GET ${path} ===`);
    try {
      const response = await fudo.request('GET', `${path}?page[size]=3`);
      const data = response?.data;
      if (!data) {
        console.log('Respuesta sin "data":', JSON.stringify(response).substring(0, 300));
        continue;
      }
      const items = Array.isArray(data) ? data : [data];
      console.log(`OK — ${items.length} registro(s) de muestra`);
      items.slice(0, 2).forEach((item, i) => {
        console.log(`\n--- registro ${i + 1} (type: ${item.type}) ---`);
        console.log('attributes:', JSON.stringify(item.attributes, null, 2));
        if (item.relationships) {
          console.log('relationships keys:', Object.keys(item.relationships));
        }
      });
    } catch (error) {
      const status = error.response?.status;
      console.log(`✗ Falló (${status || error.message})`);
    }
  }

  console.log('\n\n=== Paso 3: inspeccionar un item de venta crudo (sin include extra) ===');
  console.log('Por si el modificador ya viene embebido en attributes del item, sin relationship.');
  try {
    const path = `/sales?filter[createdAt]=and(gte.${localDate},lte.${localDate})&include=items.product&page[size]=1`;
    const response = await fudo.request('GET', path);
    const sale = response?.data?.[0];
    const itemRef = sale?.relationships?.items?.data?.[0];
    const item = (response.included || []).find((i) => i.type === itemRef?.type && i.id === itemRef?.id);
    console.log('Item crudo completo:', JSON.stringify(item, null, 2));
  } catch (error) {
    console.log(`✗ Falló (${error.response?.status || error.message})`);
  }

  console.log('\n\nListo. Pega toda esta salida en el chat.');
}

main().catch((err) => {
  console.error('Error general:', err.message);
  process.exit(1);
});
