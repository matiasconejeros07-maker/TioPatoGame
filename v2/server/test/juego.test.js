// El juego sobre PostgreSQL: cobro de partidas, racha, ruleta, misiones, tienda, perfil y marcadores.
// El servidor calcula todo; aquí se comprueba que paga lo justo, una sola vez, y que no se deja engañar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, skip } from '../testing/setup.js';
import * as E from '../../shared/economia.js';

const DAY = 86_400_000;
/** Mueve el reloj del servidor de la prueba al mediodía de Chile de un día fijo (más `extra` ms). */
const noonChile = (clock, offsetDays = 0, extra = 0) => { clock.now = Date.UTC(2026, 10, 10, 15) + offsetDays * DAY + extra; };
const give = (sql, id, pesos) => sql`UPDATE wallets SET earned = earned + ${pesos} WHERE user_id = ${id}`;

/** Juega una partida completa: empieza, deja pasar el tiempo justo y la cobra con h rebotes. */
async function play(ctx, p, h, { mode = 'classic', ms } = {}) {
  const start = await p.call('POST', '/matches', { mode });
  assert.equal(start.status, 200, JSON.stringify(start.json));
  ctx.clock.now += ms ?? h * 500 + 1000;
  return p.call('POST', `/matches/${start.json.matchId}/finish`, { hits: h, playedMs: ms ?? h * 500 });
}

test('estado inicial de una cuenta nueva (formato de la V1)', { skip }, async (t) => {
  const ctx = await setup(t); noonChile(ctx.clock);
  const ana = await ctx.newPlayer('Ana');
  const { status, json } = await ana.call('GET', '/state');
  assert.equal(status, 200);
  assert.equal(json.name, 'Ana');
  assert.deepEqual(json.wallet, { c: 0, sp: 0, lr: 0, own: {}, eq: Object.fromEntries(E.CATEGORIAS.map((c) => [c, E.defaultItem(c)])) });
  assert.equal(json.streak, null); assert.equal(json.stats, null); assert.equal(json.ruleta, null);
  assert.deepEqual(json.scores, { s: 0, t: null, ms: 0 });
  assert.deepEqual(json.v2, { pu: {}, na: false, nc: null });
});

test('partida: paga pelota × rebotes, guarda el récord, las misiones y el tiempo, y se cobra una sola vez', { skip }, async (t) => {
  const ctx = await setup(t); noonChile(ctx.clock);
  const ana = await ctx.newPlayer('Ana');
  const start = (await ana.call('POST', '/matches', { mode: 'classic' })).json;
  assert.equal(start.ball, 'peso1'); assert.equal(start.rate, 1); assert.equal(start.mult, 1);
  ctx.clock.now += 60_000;
  const fin = await ana.call('POST', `/matches/${start.matchId}/finish`, { hits: 120, playedMs: 59_000 });
  assert.equal(fin.status, 200, JSON.stringify(fin.json));
  assert.equal(fin.json.pesos, E.pesosFor(120));
  assert.equal(fin.json.wallet.c, E.pesosFor(120));
  assert.equal(fin.json.record, true); assert.equal(fin.json.best, 120);
  assert.equal(fin.json.stats.g, 1); assert.equal(fin.json.stats.dm, 120);
  assert.equal(fin.json.playedMs, 59_000);

  const again = await ana.call('POST', `/matches/${start.matchId}/finish`, { hits: 120, playedMs: 59_000 });
  assert.equal(again.json.already, true, 'repetir (se perdió la respuesta) no paga dos veces');
  assert.equal(again.json.wallet.c, E.pesosFor(120));

  const peor = await play(ctx, ana, 40);
  assert.equal(peor.json.record, false); assert.equal(peor.json.best, 120);
  const st = (await ana.call('GET', '/state')).json;
  assert.equal(st.scores.s, 120); assert.equal(st.wallet.c, E.pesosFor(120) + E.pesosFor(40)); assert.equal(st.stats.g, 2);
});

test('trampas: más rebotes de los que caben en el tiempo, números raros o partidas ajenas', { skip }, async (t) => {
  const ctx = await setup(t); noonChile(ctx.clock);
  const ana = await ctx.newPlayer('Ana'), beto = await ctx.newPlayer('Beto');
  const { matchId } = (await ana.call('POST', '/matches', { mode: 'classic' })).json;
  ctx.clock.now += 10_000;                                                                        // en 10 s caben ~28 rebotes
  const r = await ana.call('POST', `/matches/${matchId}/finish`, { hits: 200 });
  assert.equal(r.status, 422); assert.equal(r.json.error, 'rebotes_imposibles'); assert.equal(r.json.max, E.maxHits(10_000));
  for (const hits of [-1, 1.5, 501, '30', null]) assert.equal((await ana.call('POST', `/matches/${matchId}/finish`, { hits })).status, 422, String(hits));
  assert.equal((await beto.call('POST', `/matches/${matchId}/finish`, { hits: 5 })).status, 404, 'no se cobra la partida de otro');
  assert.equal((await ana.call('POST', `/matches/${matchId}/finish`, { hits: 20 })).status, 200);
  // empezar otra cierra la anterior sin cobrar
  const a = (await ana.call('POST', '/matches', { mode: 'classic' })).json; await ana.call('POST', '/matches', { mode: 'classic' });
  ctx.clock.now += 20_000;
  assert.equal((await ana.call('POST', `/matches/${a.matchId}/finish`, { hits: 10 })).json.error, 'partida_cerrada');
  // el tiempo jugado nunca suma más de lo que duró la partida en el servidor
  const fin = await play(ctx, beto, 10, { ms: 5000 });
  assert.equal(fin.status, 200);
  const b2 = (await beto.call('POST', '/matches', { mode: 'classic' })).json; ctx.clock.now += 8000;
  const f2 = await beto.call('POST', `/matches/${b2.matchId}/finish`, { hits: 10, playedMs: 999_999 });
  assert.equal(f2.json.playedInc, 8000);
});

test('dos cobros de la misma partida a la vez pagan una sola vez', { skip }, async (t) => {
  const ctx = await setup(t); noonChile(ctx.clock);
  const ana = await ctx.newPlayer('Ana');
  const { matchId } = (await ana.call('POST', '/matches', { mode: 'classic' })).json;
  ctx.clock.now += 40_000;
  const rs = await Promise.all([1, 2, 3].map(() => ana.call('POST', `/matches/${matchId}/finish`, { hits: 50 })));
  assert.ok(rs.every((r) => r.status === 200));
  assert.equal(rs.filter((r) => !r.json.already).length, 1);
  assert.equal((await ana.call('GET', '/state')).json.wallet.c, E.pesosFor(50));
});

test('tienda: comprar con pesos, equipar y que la pelota cuente desde la partida siguiente', { skip }, async (t) => {
  const ctx = await setup(t); noonChile(ctx.clock);
  const ana = await ctx.newPlayer('Ana');
  const precio = E.itemOf('ball', 'peso5').price;
  assert.equal((await ana.call('POST', '/shop/buy', { cat: 'ball', id: 'peso5' })).json.error, 'saldo_insuficiente');
  assert.equal((await ana.call('PUT', '/shop/equip', { cat: 'ball', id: 'peso5' })).json.error, 'no_comprado');
  await give(ctx.sql, ana.id, precio + 3);
  const buy = await ana.call('POST', '/shop/buy', { cat: 'ball', id: 'peso5' });
  assert.equal(buy.status, 200); assert.equal(buy.json.wallet.sp, precio); assert.equal(buy.json.wallet.own.ball_peso5, true);
  assert.equal((await ana.call('POST', '/shop/buy', { cat: 'ball', id: 'peso5' })).json.error, 'ya_comprado');
  for (const bad of [{ cat: 'ball', id: 'no-existe' }, { cat: 'ball', id: 'peso1' }, { cat: 'xx', id: 'peso5' }]) assert.equal((await ana.call('POST', '/shop/buy', bad)).status, 422);

  const start = (await ana.call('POST', '/matches', { mode: 'classic' })).json;                // empezó con la de $1
  assert.equal((await ana.call('PUT', '/shop/equip', { cat: 'ball', id: 'peso5' })).json.wallet.eq.ball, 'peso5');
  ctx.clock.now += 30_000;
  assert.equal((await ana.call('POST', `/matches/${start.matchId}/finish`, { hits: 20 })).json.pesos, E.pesosFor(20), 'cambiar la pelota a mitad de partida no cambia el pago');
  assert.equal((await play(ctx, ana, 20)).json.pesos, E.ballRate('peso5') * E.pesosFor(20));
});

test('racha: el servidor decide el día, paga la tabla y regala multiplicadores que se activan', { skip }, async (t) => {
  const ctx = await setup(t); noonChile(ctx.clock);
  const ana = await ctx.newPlayer('Ana');
  const d1 = await ana.call('POST', '/streak/claim');
  assert.equal(d1.json.n, 1); assert.equal(d1.json.pesos, E.streakReward(1)); assert.equal(d1.json.wallet.c, E.streakReward(1));
  assert.equal((await ana.call('POST', '/streak/claim')).json.error, 'racha_ya_cobrada');
  let total = E.streakReward(1);
  for (let d = 2; d <= 7; d++) { noonChile(ctx.clock, d - 1); const r = await ana.call('POST', '/streak/claim'); assert.equal(r.json.n, d); total += E.streakReward(d); }
  const st = (await ana.call('GET', '/state')).json;
  assert.equal(st.streak.n, 7); assert.equal(st.streak.x2, 1, 'el día 7 regala un ×2'); assert.equal(st.wallet.c, total);

  assert.equal((await ana.call('POST', '/streak/boost', { mult: 3, from: 'x' })).json.error, 'sin_multiplicador');
  assert.equal((await ana.call('POST', '/streak/boost', { mult: 7, from: 'x' })).status, 422);
  const on = await ana.call('POST', '/streak/boost', { mult: 2, from: 'x' });
  assert.equal(on.json.streak.bm, 2); assert.equal(on.json.streak.x2, 0);
  const fin = await play(ctx, ana, 30);
  assert.equal(fin.json.mult, 2); assert.equal(fin.json.pesos, 2 * E.pesosFor(30), 'la partida que empezó con el ×2 paga el doble');
  ctx.clock.now += E.ECO.racha.dobleMs;
  assert.equal((await play(ctx, ana, 30)).json.mult, 1, 'vencido el multiplicador, vuelve a ×1');

  noonChile(ctx.clock, 9);                                                                          // se saltó un día
  assert.equal((await ana.call('POST', '/streak/claim')).json.n, 1);
});

test('ruleta: un giro por día, el premio sale de la hora del servidor y se cobra una vez', { skip }, async (t) => {
  const ctx = await setup(t);
  const ana = await ctx.newPlayer('Ana');
  // una hora que da pesos y otra que da un multiplicador
  let tPesos = Date.UTC(2026, 10, 10, 15), tMult;
  while (!E.wheelPrize(tPesos).pesos) tPesos++;
  tMult = tPesos + DAY; while (!E.wheelPrize(tMult).mult) tMult++;

  ctx.clock.now = tPesos;
  const spin = await ana.call('POST', '/wheel/spin');
  assert.equal(spin.json.t, tPesos); assert.equal(spin.json.slot, E.wheelSlot(tPesos));
  assert.equal((await ana.call('POST', '/wheel/spin')).json.pending, true, 'mientras no cobre, girar muestra el mismo giro');
  const claim = await ana.call('POST', '/wheel/claim');
  assert.equal(claim.json.pesos, E.wheelPrize(tPesos).pesos); assert.equal(claim.json.wallet.c, E.wheelPrize(tPesos).pesos);
  assert.equal((await ana.call('POST', '/wheel/claim')).json.error, 'giro_ya_cobrado');
  assert.equal((await ana.call('POST', '/wheel/spin')).json.error, 'ruleta_ya_girada');

  ctx.clock.now = tMult;
  await ana.call('POST', '/wheel/spin');
  const m = E.wheelPrize(tMult).mult, c2 = await ana.call('POST', '/wheel/claim');
  assert.equal(c2.json.streak[`y${m}`], 1, 'el multiplicador de la ruleta queda guardado');
  assert.equal((await ana.call('POST', '/streak/boost', { mult: m, from: 'y' })).json.streak.bd, E.ECO.ruleta.multMs);
});

test('misiones: logros, casillas del día y de la semana, con la meta comprobada por el servidor', { skip }, async (t) => {
  const ctx = await setup(t); noonChile(ctx.clock);
  const ana = await ctx.newPlayer('Ana');
  assert.equal((await ana.call('POST', '/missions/claim', { logro: 'g1' })).json.error, 'mision_incompleta');
  await play(ctx, ana, 3);                                                                          // menos de minRebotes: no cuenta para misiones
  assert.equal((await ana.call('POST', '/missions/claim', { logro: 'g1' })).json.error, 'mision_incompleta');
  await play(ctx, ana, 25);
  const g1 = await ana.call('POST', '/missions/claim', { logro: 'g1' });
  assert.equal(g1.status, 200); assert.equal(g1.json.pesos, E.logroOf('g1').premio); assert.equal(g1.json.missions.g1, true);
  assert.equal((await ana.call('POST', '/missions/claim', { logro: 'g1' })).json.error, 'mision_ya_cobrada');
  assert.equal((await ana.call('POST', '/missions/claim', { logro: 'no-existe' })).status, 422);
  assert.equal((await ana.call('POST', '/missions/claim', { logro: 'e1' })).json.error, 'mision_incompleta');
  await ana.call('PUT', '/profile/avatar', { av: 'eAAAA0001' });
  assert.equal((await ana.call('POST', '/missions/claim', { logro: 'e1' })).status, 200);

  // casilla 0 de hoy: se juega hasta cumplirla
  const day = E.dayOf(ctx.clock.now), mis = E.dailyMissions(day)[0];
  for (let i = 0; i < 12; i++) {
    const st = (await ana.call('GET', '/state')).json.stats;
    if ((st[mis.campo] || 0) >= mis.meta) break;
    await play(ctx, ana, Math.min(90, Math.max(mis.tipo === 'm' ? mis.meta : 20, 20)));
  }
  const ok = await ana.call('POST', '/missions/claim', { dia: 0 });
  assert.equal(ok.status, 200, JSON.stringify(ok.json)); assert.equal(ok.json.pesos, mis.premio); assert.equal(ok.json.stats.dc & 1, 1);
  assert.equal((await ana.call('POST', '/missions/claim', { dia: 0 })).json.error, 'mision_ya_cobrada');
  assert.equal((await ana.call('POST', '/missions/claim', { dia: 9 })).status, 422);
  const sem = E.weeklyMissions(E.weekOf(day))[2];                                                  // la casilla difícil de la semana: todavía no
  assert.equal((await ana.call('POST', '/missions/claim', { semana: 2 })).json.error, 'mision_incompleta', `${sem.tipo} ${sem.meta}`);
  noonChile(ctx.clock, 1);                                                                          // día nuevo: la casilla vuelve a estar sin cumplir
  assert.equal((await ana.call('POST', '/missions/claim', { dia: 0 })).json.error, 'mision_incompleta');
});

test('perfil: emblema y marco dorado (solo con el personaje secreto)', { skip }, async (t) => {
  const ctx = await setup(t); noonChile(ctx.clock);
  const ana = await ctx.newPlayer('Ana');
  assert.equal((await ana.call('PUT', '/profile/avatar', { av: '<script>' })).status, 422);
  assert.equal((await ana.call('PUT', '/profile/avatar', { av: 'eAAAA0001' })).json.av, 'eAAAA0001');
  assert.equal((await ana.call('PUT', '/profile/frame', { on: true })).json.error, 'sin_personaje_secreto');
  await give(ctx.sql, ana.id, E.itemOf('ch', E.SECRET_ID).price);
  assert.equal((await ana.call('POST', '/shop/buy', { cat: 'ch', id: E.SECRET_ID })).status, 200);
  assert.equal((await ana.call('PUT', '/profile/frame', { on: true })).json.marco, true);
  const st = (await ana.call('GET', '/state')).json;
  assert.equal(st.marco, true); assert.deepEqual(st.compradores, { n: 'Ana' });
});

test('marcadores: los mejores (públicos) y tu puesto', { skip }, async (t) => {
  const ctx = await setup(t); noonChile(ctx.clock);
  const jug = [];
  for (const [n, h] of [['Ana', 40], ['Beto', 90], ['Caro', 60]]) { const p = await ctx.newPlayer(n); await play(ctx, p, h); jug.push(p); }
  await play(ctx, jug[0], 70, { mode: 'arcade' });
  const top = await ctx.app.request('/leaderboards/g');
  assert.equal(top.status, 200); assert.match(top.headers.get('cache-control'), /max-age=30/);
  assert.deepEqual((await top.json()).rows.map((r) => [r.n, r.s]), [['Beto', 90], ['Caro', 60], ['Ana', 40]]);
  assert.deepEqual((await (await ctx.app.request('/leaderboards/a')).json()).rows.map((r) => [r.n, r.s]), [['Ana', 70]]);
  assert.deepEqual((await (await ctx.app.request('/leaderboards/w')).json()).rows.map((r) => r.n), ['Beto', 'Caro', 'Ana']);
  assert.equal((await ctx.app.request('/leaderboards/zz')).status, 422);
  assert.deepEqual((await jug[0].call('GET', '/leaderboards/g/me')).json, { s: 40, rank: 3 });
  assert.deepEqual((await jug[1].call('GET', '/leaderboards/g/me')).json, { s: 90, rank: 1 });
  noonChile(ctx.clock, 8);                                                                          // otra semana: el semanal parte vacío
  assert.deepEqual((await (await ctx.app.request('/leaderboards/w')).json()).rows, []);
  assert.equal((await (await ctx.app.request('/leaderboards/g')).json()).rows.length, 3);
});

test('CORS: la app (Capacitor) puede llamar a la API; otros sitios no', { skip }, async (t) => {
  const ctx = await setup(t);
  const pre = (origin) => ctx.app.request('/v2/state', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'x-session,x-signature' } });
  assert.equal((await pre('https://localhost')).headers.get('access-control-allow-origin'), 'https://localhost');
  assert.equal((await pre('capacitor://localhost')).headers.get('access-control-allow-origin'), 'capacitor://localhost');
  assert.equal((await pre('https://sitio-malo.example')).headers.get('access-control-allow-origin'), null);
});

test('arcade no cuenta para misiones ni semana; el tiempo medido se corrige una vez; hist y VIP', { skip }, async (t) => {
  const ctx = await setup(t); noonChile(ctx.clock);
  const ana = await ctx.newPlayer('Ana');
  const arc = await play(ctx, ana, 40, { mode: 'arcade' });
  assert.equal(arc.json.stats, null, 'una partida arcade no suma a las misiones');
  assert.deepEqual((await (await ctx.app.request('/leaderboards/w')).json()).rows, []);
  // cobro sin medición y después el juego informa lo que midió (como en la V1)
  const s = (await ana.call('POST', '/matches', { mode: 'classic' })).json; ctx.clock.now += 30_000;
  const fin = await ana.call('POST', `/matches/${s.matchId}/finish`, { hits: 30 });
  assert.equal(fin.json.playedInc, 30_000 - E.ECO.tiempo.cuentaMs);
  const st0 = (await ana.call('GET', '/state')).json;
  assert.equal(st0.wallet.lr, s.s, 'la cartera dice cuál fue la última partida cobrada');
  const pl = await ana.call('POST', `/matches/${s.matchId}/played`, { playedMs: 28_000 });
  assert.equal(pl.json.inc, 28_000);
  assert.equal((await ana.call('POST', `/matches/${s.matchId}/played`, { playedMs: 1 })).json.inc, 28_000, 'se corrige una sola vez');
  assert.equal((await ana.call('GET', '/state')).json.scores.ms, st0.scores.ms - fin.json.playedInc + 28_000);
  const hist = (await (await ctx.app.request('/leaderboards/hist')).json()).counts;
  assert.equal(hist.length, E.ECO.hMax + 1); assert.equal(hist[30], 1); assert.equal(hist.reduce((a, b) => a + b, 0), 1);
  await ctx.sql`INSERT INTO inventory (user_id, item_id) VALUES (${ana.id}, ${'ch_' + E.SECRET_ID})`;
  assert.equal((await ana.call('PUT', '/account/vip', { whatsapp: '+56912345678', consent: true })).status, 204);
  assert.equal((await ana.call('GET', '/state')).json.vip.w, '+56912345678');
  assert.equal((await ana.call('DELETE', '/account/vip')).status, 204);
  assert.equal((await ana.call('GET', '/state')).json.vip, null);
});
