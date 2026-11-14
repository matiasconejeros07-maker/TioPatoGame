// La economía del servidor (shared/economia.js) tiene que dar EXACTAMENTE lo mismo que el juego (index.html) y que las
// reglas de Firebase de la V1. Aquí se comparan con las funciones sacadas tal cual del juego.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../../shared/economia.js';
import { TIENDA } from '../../shared/tienda-datos.js';

const html = readFileSync(new URL('../../juego/index.html', import.meta.url), 'utf8');
/** Saca del juego la definición `const nombre = …;` (una línea) y la evalúa con las constantes que necesita. */
function delJuego(nombre, ctx) {
  const m = html.match(new RegExp(`const ${nombre} = (.*?);(?:\\s*//.*)?\\n`));
  assert.ok(m, 'no encontré ' + nombre + ' en index.html');
  return new Function(...Object.keys(ctx), `return (${m[1]});`)(...Object.values(ctx));
}
const DAYMS = 86400000, HUSO_MS = TIENDA.eco.racha.huso * 3600000, TIER = TIENDA.eco.tier, RACHA = TIENDA.eco.racha;

test('pesos por partida: iguales al juego para 0 a 500 rebotes', () => {
  const juego = delJuego('pesosFor', { TIER });
  for (let h = 0; h <= 500; h++) assert.equal(E.pesosFor(h), juego(h), `h=${h}`);
  assert.equal(E.pesosFor(99), 99); assert.equal(E.pesosFor(100), 101); assert.equal(E.pesosFor(200), 302);
});

test('día, semana y mes de Chile: iguales al juego', () => {
  const dayOf = delJuego('dayOf', { HUSO_MS, DAYMS }), weekOf = delJuego('weekOf', {}), monthOf = delJuego('monthOf', { DAYMS });
  for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2027, 0, 1); t += 3_600_000 * 7) {
    const d = E.dayOf(t); assert.equal(d, dayOf(t)); assert.equal(E.weekOf(d), weekOf(d)); assert.equal(E.monthOf(d), monthOf(d));
  }
  // el día cambia a medianoche de Chile (03:00 UTC)
  assert.equal(E.dayOf(Date.UTC(2026, 10, 14, 2, 59)), E.dayOf(Date.UTC(2026, 10, 13, 12)));
  assert.equal(E.dayOf(Date.UTC(2026, 10, 14, 3, 0)), E.dayOf(Date.UTC(2026, 10, 13, 12)) + 1);
  assert.equal(E.monthOf(E.dayOf(Date.UTC(2026, 10, 30, 12))), 202611);
});

test('multiplicador de la partida: iguales al juego', () => {
  const boost = delJuego('boostMult', { RACHA });
  const bx = 1_000_000;
  for (const [s, bm, bd] of [[bx, 2, 600000], [bx + 599_999, 3, 600000], [bx + 600_000, 3, 600000], [bx - 1, 4, 300000], [bx + 299_999, 4, 300000], [bx + 300_000, 4, 300000], [bx + 5, 0, 0]])
    assert.equal(E.boostMult(s, { bx, bm, bd }), boost(s, bx, bm, bd), `s=${s} bm=${bm} bd=${bd}`);
  assert.equal(E.boostMult(5, null), 1);
});

test('racha: el día que toca, el premio y los multiplicadores de regalo', () => {
  const d0 = Date.UTC(2026, 10, 10, 15);
  assert.equal(E.nextStreakDay(null, d0), 1);
  assert.equal(E.nextStreakDay({ n: 4, t: d0 }, d0 + 3600_000), null);              // mismo día: no se cobra
  assert.equal(E.nextStreakDay({ n: 4, t: d0 }, d0 + DAYMS), 5);                     // día siguiente
  assert.equal(E.nextStreakDay({ n: 4, t: d0 }, d0 + 2 * DAYMS), 1);                 // se saltó un día
  const rachaPago = delJuego('rachaPago', { RACHA }), rachaMult = delJuego('rachaMult', { RACHA });
  for (let n = 1; n <= 60; n++) { assert.equal(E.streakReward(n), rachaPago(n)); assert.equal(E.streakGift(n), rachaMult(n)); }
  assert.deepEqual([E.streakGift(7), E.streakGift(14), E.streakGift(21), E.streakGift(8)], [2, 3, 4, 0]);
});

test('ruleta: el premio sale de la hora del giro, igual que en el juego', () => {
  const RUL = TIENDA.eco.ruleta, RUL_N = RUL.premios.reduce((a, x) => a + x[2], 0);
  const slot = delJuego('rulaSlot', { RUL, RUL_N });
  for (let t = 1_700_000_000_000; t < 1_700_000_000_000 + 60; t++) assert.equal(E.wheelSlot(t), slot(t));
  const d = Date.UTC(2026, 10, 10, 15);
  assert.equal(E.canSpin(null, d), true); assert.equal(E.canSpin(d, d + 3600_000), false); assert.equal(E.canSpin(d, d + DAYMS), true);
});

test('misiones del día y de la semana: las mismas casillas que el juego', () => {
  const pickJ = delJuego('pickJ', {}), MIS = TIENDA.eco.misiones, pickW = delJuego('pickW', { MIS });
  for (let day = 20000; day < 20030; day++) E.dailyMissions(day).forEach((m, k) => assert.deepEqual([m.tipo, m.meta], MIS.dia[k].de[pickJ(day, k)]));
  for (let wk = 2900; wk < 2920; wk++) E.weeklyMissions(wk).forEach((m, k) => assert.deepEqual([m.tipo, m.meta], MIS.semana.de[k][pickW(wk, k)]));
});

test('rebotes posibles y tiempo jugado (topes antitrampas)', () => {
  assert.equal(E.maxHits(0), Math.floor(TIENDA.eco.holguraMs / TIENDA.eco.msPorRebote));
  assert.equal(E.maxHits(45_000), Math.floor(48_000 / 450));
  assert.equal(E.maxHits(10 * 3600_000), TIENDA.eco.hMax);
  assert.equal(E.playedIncrement(60_000, 50_000, 100), 50_000);                       // nunca más de lo que duró en el servidor
  assert.equal(E.playedIncrement(60_000, 600_000, 2), 2 * 4500 + 6000);                // ni más del tope por rebotes
  assert.equal(E.playedIncrement(0, 20_000, 50), 20_000 - TIENDA.eco.tiempo.cuentaMs); // sin medición: lo del servidor menos la cuenta regresiva
});

test('estadísticas de las misiones después de una partida', () => {
  const now = Date.UTC(2026, 10, 10, 15), day = E.dayOf(now);
  const a = E.statsAfterMatch(null, 30, now - 60_000, now);
  assert.equal(a.g, 1); assert.equal(a.dg, 1); assert.equal(a.dm, 30); assert.equal(a.d, day); assert.equal(a.dc, 0); assert.equal(a.wm, 30); assert.equal(a.mm, 30);
  const b = E.statsAfterMatch({ ...a, dc: 3 }, 12, now, now + 1000);
  assert.equal(b.g, 2); assert.equal(b.r, 42); assert.equal(b.dm, 30); assert.equal(b.dc, 3);
  const c = E.statsAfterMatch(b, 5, now, now + DAYMS);                                  // día nuevo: los de hoy vuelven a empezar
  assert.equal(c.dg, 1); assert.equal(c.dc, 0); assert.equal(c.g, 3);
});

test('tienda: precios, artículos por defecto y ediciones limitadas', () => {
  assert.equal(E.defaultItem('ball'), 'peso1');
  assert.equal(E.buyable('ball', 'peso1', 0), false);                                 // gratis: no se compra
  assert.equal(E.buyable('ball', 'diamante', 0), true);
  assert.equal(E.buyable('ball', 'no-existe', 0), false);
  assert.equal(E.buyable('xx', 'diamante', 0), false);
  for (const cat of E.CATEGORIAS) for (const it of TIENDA[cat].filter((i) => i.until)) { assert.equal(E.buyable(cat, it.id, it.until - 1), it.price > 0); assert.equal(E.buyable(cat, it.id, it.until), false); }
  assert.ok(E.SECRET_ID);
});
