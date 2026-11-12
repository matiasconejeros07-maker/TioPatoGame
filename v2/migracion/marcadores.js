// Reconstruye los marcadores de Redis/Valkey (ZSET) desde PostgreSQL. Redis es solo una caché rápida:
// si se pierde, se vuelve a ejecutar esto. Devuelve los comandos; migrar.js los imprime para `redis-cli`.
// Hay un juego de marcadores por modo: classic (sin power-ups de pago) y arcade (con power-ups).
export const KEYS = Object.freeze({
  best: (mode) => `lb:${mode}:best`,                              // mejor partida de siempre
  period: (mode, kind, period) => `lb:${mode}:${kind}:${period}`, // lb:classic:w:<semana> · lb:classic:m:<AAAAMM>
  time: 'lb:time',                                                // tiempo jugado (de la cuenta, sin modo)
});

/** @param {import('postgres').Sql} sql @returns {Promise<string[][]>} comandos como listas de argumentos */
export async function leaderboardCommands(sql) {
  const commands = [['DEL', KEYS.best('classic'), KEYS.best('arcade'), KEYS.time]];
  for (const r of await sql`SELECT user_id, mode, best FROM scores WHERE best > 0`) commands.push(['ZADD', KEYS.best(r.mode), String(r.best), r.user_id]);
  for (const r of await sql`SELECT id, played_ms FROM users WHERE played_ms > 0`) commands.push(['ZADD', KEYS.time, String(r.played_ms), r.id]);
  const seen = new Set();
  for (const r of await sql`SELECT mode, kind, period, user_id, best FROM period_scores ORDER BY mode, kind, period`) {
    const key = KEYS.period(r.mode, r.kind, r.period);
    if (!seen.has(key)) { seen.add(key); commands.push(['DEL', key]); }
    commands.push(['ZADD', key, String(r.best), r.user_id]);
  }
  return commands;
}
