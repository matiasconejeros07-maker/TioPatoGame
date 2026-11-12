// Reconstruye los marcadores de Redis/Valkey (ZSET) desde PostgreSQL. Redis es solo una caché rápida:
// si se pierde, se vuelve a ejecutar esto. Devuelve los comandos; migrar.js los imprime para `redis-cli`.
export const KEYS = Object.freeze({
  best: 'lb:best',                              // mejor partida de siempre
  time: 'lb:time',                              // tiempo jugado
  period: (kind, period) => `lb:${kind}:${period}`,   // lb:w:<semana> · lb:m:<AAAAMM>
});

/** @param {import('postgres').Sql} sql @returns {Promise<string[][]>} comandos como listas de argumentos */
export async function leaderboardCommands(sql) {
  const commands = [['DEL', KEYS.best, KEYS.time]];
  for (const r of await sql`SELECT user_id, best, played_ms FROM scores`) {
    if (r.best > 0) commands.push(['ZADD', KEYS.best, String(r.best), r.user_id]);
    if (Number(r.played_ms) > 0) commands.push(['ZADD', KEYS.time, String(r.played_ms), r.user_id]);
  }
  const seen = new Set();
  for (const r of await sql`SELECT kind, period, user_id, best FROM period_scores ORDER BY kind, period`) {
    const key = KEYS.period(r.kind, r.period);
    if (!seen.has(key)) { seen.add(key); commands.push(['DEL', key]); }
    commands.push(['ZADD', key, String(r.best), r.user_id]);
  }
  return commands;
}
