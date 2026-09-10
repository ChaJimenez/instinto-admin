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
 * Primera corrida (2026-09-10) probó includes candidatos uno por uno contra
 * /sales — todos fallaron con 400, pero el propio error de Fudo trae en
 * `detail` el patrón regex COMPLETO de includes válidos (se había estado
 * recortando a 300 caracteres, perdiendo la lista real). Este script ahora
 * dispara UN include inválido a propósito, imprime el patrón sin recortar,
 * y busca "modif" dentro de él para encontrar el nombre real de la relación.
 *
 * Uso: node src/debug-item-modifiers.js
 */

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

  console.log('=== Paso 1: capturar la lista COMPLETA de `include` válidos en /sales ===');
  console.log('(Fudo valida `include` contra un regex y lo manda de vuelta entero en el error 400.)\n');
  try {
    await fudo.request('GET', '/sales?include=__forzar_error_400__&page[size]=1');
    console.log('(No falló — raro, revisar a mano.)');
  } catch (error) {
    const body = error.response?.data;
    const detail = body?.errors?.[0]?.detail || '';
    console.log('Detalle completo del error:\n', detail);

    const modifierMatches = detail.match(/[a-zA-Z.]*modif[a-zA-Z.]*/gi) || [];
    console.log('\nCoincidencias con "modif" en la lista de includes válidos:', [...new Set(modifierMatches)]);
  }

  console.log('\n\n=== Paso 2: probar endpoints candidatos directos de modificadores ===');
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

  console.log('\n\n=== Paso 3: probar items.subitems.product (hipótesis: toppings = subitems) ===');
  console.log('El regex de /sales no tiene nada con "modif", pero sí existe `items.subitems` y');
  console.log('`items.subitems.product` — cada topping (Aguacate, Extra carne, etc.) tiene su propio');
  console.log('precio en el catálogo como si fuera un producto, así que es el candidato más fuerte.\n');

  const target = new Date('2026-09-09T12:00:00-06:00');
  const localStart = fudo.formatDate(target);
  const queryStart = fudo.formatDate(new Date(target.getTime() - 24 * 60 * 60 * 1000));
  const queryEnd = fudo.formatDate(new Date(target.getTime() + 48 * 60 * 60 * 1000));
  const filter = encodeURIComponent(`and(gte.${queryStart},lte.${queryEnd})`);
  const path = `/sales?filter[createdAt]=${filter}&include=items.product,items.subitems.product,waiter&page[size]=250`;

  try {
    const response = await fudo.request('GET', path);
    const sales = response?.data || [];
    const included = response?.included || [];

    console.log(`OK — ${sales.length} venta(s) traídas, ${included.length} recurso(s) en included.`);
    console.log('Tipos en included:', [...new Set(included.map((i) => i.type))]);

    // Buscar el primer item de venta que SÍ tenga subitems, para no imprimir
    // uno vacío al azar.
    let foundExample = false;
    for (const sale of sales) {
      const itemRefs = sale.relationships?.items?.data || [];
      for (const itemRef of itemRefs) {
        const item = included.find((i) => i.type === itemRef.type && i.id === itemRef.id);
        const subitemRefs = item?.relationships?.subitems?.data || [];
        if (subitemRefs.length > 0) {
          foundExample = true;
          console.log(`\n--- venta=${sale.id} item con subitems (item id=${item.id}) ---`);
          console.log('item attributes:', JSON.stringify(item.attributes, null, 2));
          console.log('item relationships keys:', Object.keys(item.relationships || {}));
          subitemRefs.forEach((subRef) => {
            const subitem = included.find((i) => i.type === subRef.type && i.id === subRef.id);
            console.log(`\n  subitem (type=${subRef.type}, id=${subRef.id}):`, JSON.stringify(subitem, null, 2));
          });
        }
      }
      if (foundExample) break;
    }

    if (!foundExample) {
      console.log('\nNingún item del día tuvo subitems. Puede que ese día no se haya vendido nada con topping,');
      console.log('o que los modificadores no viajen como subitems. Mostrando un item cualquiera para comparar:');
      const anySale = sales.find((s) => (s.relationships?.items?.data || []).length > 0);
      const anyItemRef = anySale?.relationships?.items?.data?.[0];
      const anyItem = included.find((i) => i.type === anyItemRef?.type && i.id === anyItemRef?.id);
      console.log(JSON.stringify(anyItem, null, 2));
    }
  } catch (error) {
    const status = error.response?.status;
    console.log(`✗ Falló (${status || error.message})`);
    if (error.response?.data) console.log('detalle:', JSON.stringify(error.response.data));
  }

  console.log('\n\nListo. Pega toda esta salida en el chat.');
}

main().catch((err) => {
  console.error('Error general:', err.message);
  process.exit(1);
});
