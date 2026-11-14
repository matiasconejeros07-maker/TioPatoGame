// Prueba de carga: muchos jugadores a la vez contra la API completa y un PostgreSQL real.
// Cada jugador simulado hace lo que hace una persona: abre el juego (estado), juega partidas (empezar → cobrar → tiempo),
// mira el marcador, cobra la racha, gira la ruleta, compra algo… con pausas como las de una persona.
//   TEST_DATABASE_URL=postgres://… node testing/carga.mjs [jugadores] [segundos] [pausa_ms]
import { createApp } from '../src/app.js';
import { SessionRepository } from '../src/repositories/SessionRepository.js';
import { PurchaseRepository } from '../src/repositories/PurchaseRepository.js';
import { AccountRepository } from '../src/repositories/AccountRepository.js';
import { MatchRepository } from '../src/repositories/MatchRepository.js';
import { GameRepository } from '../src/repositories/GameRepository.js';
import { PurchaseService } from '../src/services/PurchaseService.js';
import { MemoryRedis, NonceStore, RateLimiter } from '../src/services/stores.js';
import { deriveSessionKey, newNonce, sign } from '../../shared/signature.js';
import { createTestDatabase } from '../../test-support/db.js';
import postgres from 'postgres';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const JUG = Number(process.argv[2] || 1000), SEG = Number(process.argv[3] || 60), PAUSA = Number(process.argv[4] || 1500);
const POOL = Number(process.env.POOL || 20);
const MASTER = 'carga';
const db = await createTestDatabase(), sql = postgres(db.url, { max: POOL, onnotice: () => {} });
const redis = new MemoryRedis(Date.now);
const app = createApp({
  masterSecret: MASTER, sessions: new SessionRepository(sql), nonces: new NonceStore(redis), rateLimiter: new RateLimiter(redis),
  sessionLimiter: { allow: (k) => new RateLimiter(redis).allow(k, 120, 60) }, cacheSessions: true,
  accounts: new AccountRepository(sql), matches: new MatchRepository(sql), game: new GameRepository(sql),
  purchaseService: new PurchaseService({ purchases: new PurchaseRepository(sql), verifiers: {} }),
  edgeCache: memCache(),
});
/** Caché del borde de mentira (Cloudflare la da hecha): 30 s. */
function memCache() { const m = new Map(); return { async match(k) { const e = m.get(k.url); return e && e.hasta > Date.now() ? e.res.clone() : undefined; }, async put(k, r) { m.set(k.url, { res: r, hasta: Date.now() + 30_000 }); } }; }

// jugadores con su sesión (como si ya hubieran iniciado sesión)
console.error(`creando ${JUG} jugadores…`);
const jugadores = [];
for (let i = 0; i < JUG; i += 500) {
  const n = Math.min(500, JUG - i);
  const users = await sql`INSERT INTO users ${sql(Array.from({ length: n }, (_, k) => ({ display_name: 'J' + (i + k), name_key: 'jugador.' + (i + k) })))} RETURNING id`;
  await sql`INSERT INTO wallets ${sql(users.map((u) => ({ user_id: u.id, earned: 2000 })))}`;
  const ses = await sql`INSERT INTO sessions ${sql(users.map((u) => ({ user_id: u.id, expires_at: new Date(Date.now() + 86400000) })))} RETURNING id, user_id`;
  for (const s of ses) jugadores.push({ uid: s.user_id, sid: s.id, key: await deriveSessionKey(MASTER, s.id) });
}

const lat = {}, errores = {};
let total = 0;
async function call(j, method, path, data) {
  const body = data === undefined ? '' : JSON.stringify(data), ts = String(Date.now()), nonce = newNonce();
  const t0 = performance.now();
  const res = await app.request('/v2' + path, { method, body: body || undefined, headers: { 'x-session': j.sid, 'x-timestamp': ts, 'x-nonce': nonce, 'x-signature': await sign(j.key, body, ts, nonce) } });
  const ms = performance.now() - t0, nombre = method + ' ' + path.replace(/[0-9a-f-]{36}/, ':id');
  (lat[nombre] ||= []).push(ms); total++;
  const json = res.status === 204 ? null : await res.json();
  if (res.status >= 400) { const k = `${nombre} ${res.status} ${json?.error}`; errores[k] = (errores[k] || 0) + 1; }
  return { status: res.status, json };
}
async function publico(path) {
  const t0 = performance.now(); const res = await app.request(path); await res.text();
  (lat['GET ' + path] ||= []).push(performance.now() - t0); total++;
  if (res.status >= 400) errores['GET ' + path + ' ' + res.status] = (errores['GET ' + path + ' ' + res.status] || 0) + 1;
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const azar = (a, b) => a + Math.random() * (b - a);

const fin = Date.now() + SEG * 1000;
async function jugador(j) {
  await dormir(Math.random() * 5000);                                        // no todos abren el juego en el mismo milisegundo
  await call(j, 'GET', '/state');
  await call(j, 'POST', '/streak/claim');
  if (Math.random() < .5) { await call(j, 'POST', '/wheel/spin'); await call(j, 'POST', '/wheel/claim'); }
  while (Date.now() < fin) {
    const m = await call(j, 'POST', '/matches', { mode: Math.random() < .2 ? 'arcade' : 'classic' });
    const dur = azar(1500, 4000); await dormir(dur);                         // «jugar» (corto, para que entren muchas partidas)
    if (m.json?.matchId) {
      const hits = Math.floor(Math.random() * Math.min(8, (dur + 2000) / 450));
      await call(j, 'POST', `/matches/${m.json.matchId}/finish`, { hits, playedMs: dur });
      await call(j, 'GET', '/state');                                        // el juego recarga el estado después de cobrar
      await call(j, 'POST', `/matches/${m.json.matchId}/played`, { playedMs: dur - 100 });
    }
    const r = Math.random();
    if (r < .25) { await publico('/leaderboards/g'); await publico('/leaderboards/hist'); }
    else if (r < .3) await call(j, 'POST', '/shop/buy', { cat: 'ball', id: 'peso5' });
    else if (r < .33) await call(j, 'POST', '/missions/claim', { logro: 'g1' });
    await dormir(azar(PAUSA * .5, PAUSA * 1.5));                             // mirar el resultado, tocar «otra vez»…
  }
}

const pg0 = (await sql`SELECT xact_commit, xact_rollback, deadlocks, active_time FROM pg_stat_database WHERE datname = current_database()`)[0];
const loop = monitorEventLoopDelay({ resolution: 20 }); loop.enable();
const t0 = Date.now();
console.error(`${JUG} jugadores jugando ${SEG} s…`);
await Promise.all(jugadores.map(jugador));
const seg = (Date.now() - t0) / 1000;
const pg1 = (await sql`SELECT xact_commit, xact_rollback, deadlocks, active_time FROM pg_stat_database WHERE datname = current_database()`)[0];
const [cuentas] = await sql`SELECT (SELECT count(*) FROM matches WHERE hits IS NOT NULL)::int AS cobradas, (SELECT count(*) FROM matches)::int AS partidas,
  (SELECT sum(earned)::bigint FROM wallets) AS pesos, (SELECT count(*) FROM wallets WHERE spent > earned)::int AS negativas`;
const p = (a, q) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))];

console.log(`\n${JUG} jugadores · ${seg.toFixed(0)} s · ${total} peticiones · ${(total / seg).toFixed(0)} por segundo · pool PostgreSQL ${POOL}`);
console.log('acción'.padEnd(34), 'n'.padStart(7), 'p50 ms'.padStart(8), 'p95 ms'.padStart(8), 'p99 ms'.padStart(8));
for (const [k, a] of Object.entries(lat).sort()) console.log(k.padEnd(34), String(a.length).padStart(7), p(a, .5).toFixed(1).padStart(8), p(a, .95).toFixed(1).padStart(8), p(a, .99).toFixed(1).padStart(8));
console.log('\nrespuestas con error:', Object.keys(errores).length ? '' : 'ninguna'); for (const [k, n] of Object.entries(errores)) console.log('  ', n, k);
console.log(`\nPostgreSQL: ${pg1.xact_commit - pg0.xact_commit} transacciones (${((pg1.xact_commit - pg0.xact_commit) / seg).toFixed(0)}/s), ${pg1.xact_rollback - pg0.xact_rollback} revertidas, ${pg1.deadlocks - pg0.deadlocks} bloqueos mutuos`);
const activo = pg1.active_time - pg0.active_time, tx = pg1.xact_commit - pg0.xact_commit;
console.log(`PostgreSQL trabajó ${(activo / 1000).toFixed(1)} s en ${seg.toFixed(0)} s → en promedio ${(activo / 1000 / seg).toFixed(2)} conexiones ocupadas a la vez · ${(activo / tx).toFixed(2)} ms por transacción`);
console.log(`atraso del proceso de la prueba (generador + API en un solo núcleo): p50 ${(loop.percentile(50) / 1e6).toFixed(0)} ms · p99 ${(loop.percentile(99) / 1e6).toFixed(0)} ms`);
console.log(`partidas: ${cuentas.partidas} empezadas, ${cuentas.cobradas} cobradas · carteras con saldo negativo: ${cuentas.negativas}`);
await sql.end(); await db.drop(); process.exit(0);
