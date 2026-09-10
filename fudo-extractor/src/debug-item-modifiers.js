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

  console.log('\n\n=== Paso 3: inspeccionar un item de venta crudo con el include de modificadores que resulte válido ===');
  console.log('(Editar MODIFIER_INCLUDE abajo con lo que haya salido del Paso 1 antes de correr esta parte de nuevo si hace falta.)');

  console.log('\n\nListo. Pega toda esta salida en el chat.');
}

main().catch((err) => {
  console.error('Error general:', err.message);
  process.exit(1);
});
