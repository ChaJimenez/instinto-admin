require('dotenv').config();
const BasecampIntegration = require('./integrations/basecamp');

/**
 * Corrige el hilo fijo de cortes diarios en Basecamp cuando `npm run
 * daily:now` (sin fecha) se corrió por error el mismo día que un backfill
 * manual del mismo día (con `node src/run-daily-sync-now.js YYYY-MM-DD`),
 * dejando dos bloques "📅 <misma fecha>" idénticos y seguidos.
 *
 * Solo borra duplicados ADYACENTES y de contenido EXACTAMENTE igual — nunca
 * toca bloques de días distintos, aunque coincidan en algún número.
 * Uso: node src/fix-duplicate-daily-block.js
 */
async function main() {
  const basecamp = new BasecampIntegration();

  const current = await basecamp.run([
    'messages', 'show', basecamp.dailyMessageId,
    '--message-board', basecamp.messageBoardId,
  ]);
  const content = current.data?.content || current.content || '';

  const blocks = content.split('<hr>');
  const deduped = [];
  let removed = 0;

  for (const block of blocks) {
    const prev = deduped[deduped.length - 1];
    if (prev !== undefined && prev.trim() === block.trim()) {
      removed++;
      continue;
    }
    deduped.push(block);
  }

  if (removed === 0) {
    console.log('✅ No se encontraron bloques duplicados adyacentes. No se cambió nada.');
    return;
  }

  const newContent = deduped.join('<hr>');

  await basecamp.run([
    'messages', 'update', basecamp.dailyMessageId,
    '--message-board', basecamp.messageBoardId,
    '--body', newContent,
  ]);

  console.log(`✅ Se quitaron ${removed} bloque(s) duplicado(s) del mensaje ${basecamp.dailyMessageId}.`);
}

main().catch((err) => {
  console.error('❌ Error corrigiendo duplicados:', err.message);
  process.exit(1);
});
