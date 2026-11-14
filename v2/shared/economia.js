// Economía del juego: las MISMAS fórmulas que la V1 aplicaba en las reglas de Firebase (herramientas/generar-reglas.js)
// y en el juego (index.html), ahora en un solo lugar para el servidor. Todo sale del catálogo (tienda-datos.js).
// Funciones puras: reciben la hora del servidor (ms) y los datos; no leen relojes ni la base.
import { TIENDA } from './tienda-datos.js';

export const ECO = TIENDA.eco;
const DAY = 86_400_000, HUSO_MS = ECO.racha.huso * 3_600_000;
export const CATEGORIAS = ['ch', 'bg', 'pad', 'ball', 'th', 'sfx'].filter((c) => Array.isArray(TIENDA[c]));

// ---------- calendario (hora de Chile, huso fijo de la V1) ----------
/** Número de día: cambia a medianoche del huso de Chile. */
export const dayOf = (ms) => Math.floor((ms + HUSO_MS) / DAY);
/** Semana (empieza el lunes; el día 0 fue jueves). */
export const weekOf = (day) => Math.floor((day + 3) / 7);
/** Mes calendario AAAAMM del día de Chile `day`. */
export const monthOf = (day) => { const d = new Date(day * DAY); return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1; };
/** Hora (ms) en que empieza el día siguiente. */
export const nextDayAt = (ms) => (dayOf(ms) + 1) * DAY - HUSO_MS;

// ---------- partidas ----------
/** Pesos de una partida de h rebotes: $1 por rebote del 1 al 99, $2 del 100 al 199… */
export function pesosFor(h) { const E = ECO.tier, t = Math.floor(h / E); return h + E * t * (t - 1) / 2 + t * (h - E * t + 1); }
/** Pesos por punto de una pelota (0 si no existe). */
export const ballRate = (ballId) => TIENDA.ball.find((b) => b.id === ballId)?.rate ?? 0;
/** ¿La partida empezó (startMs) con un multiplicador activo? Devuelve ×bm o 1 (activaciones antiguas sin bm: ×2, sin bd: 10 min). */
export function boostMult(startMs, streak) {
  if (!streak?.bx) return 1;
  const dura = streak.bd || ECO.racha.dobleMs;
  return startMs >= streak.bx && startMs < streak.bx + dura ? (streak.bm || 2) : 1;
}
/** Máximo de rebotes posible en `elapsedMs` (no se puede rebotar más rápido que msPorRebote). */
export const maxHits = (elapsedMs) => Math.min(ECO.hMax, Math.floor((elapsedMs + ECO.holguraMs) / ECO.msPorRebote));
/** Tiempo jugado que suma una partida: lo que midió el juego, sin pasar de lo que duró en el servidor ni del tope por rebotes. */
export function playedIncrement(clientMs, elapsedMs, hits) {
  const cap = Math.min(elapsedMs, hits * ECO.tiempo.msPorRebote + ECO.tiempo.holguraMs);
  const medido = Number.isFinite(clientMs) && clientMs > 0 ? Math.round(clientMs) : elapsedMs - ECO.tiempo.cuentaMs;
  return Math.max(0, Math.min(medido, cap));
}

// ---------- racha diaria ----------
/** El día de racha que toca al cobrar ahora: 1 la primera vez o después de saltarse un día, n+1 al día siguiente; null = ya cobrado hoy. */
export function nextStreakDay(streak, now) {
  if (!streak || !streak.t) return 1;
  const hoy = dayOf(now), ultimo = dayOf(streak.t);
  if (hoy === ultimo + 1) return streak.n + 1;
  return hoy > ultimo ? 1 : null;
}
export const streakReward = (n) => (n >= ECO.racha.fijoDesde ? ECO.racha.fijo : (ECO.racha.dias[n - 1] || 0));
/** Multiplicador que regala el día n (0 = ninguno). */
export const streakGift = (n) => ECO.racha.mult.find(([d]) => d === n)?.[1] ?? 0;
export const STREAK_MULTS = ECO.racha.mult.map(([, m]) => m);
export const WHEEL_MULTS = [...new Set(ECO.ruleta.premios.filter(([, m]) => m > 0).map(([, m]) => m))];

// ---------- ruleta diaria ----------
const RU_N = ECO.ruleta.premios.reduce((a, [, , w]) => a + w, 0);
/** Casilla del premio que toca con la hora del giro t (el resultado lo decide la hora del servidor). */
export function wheelSlot(t) { const x = ((t % RU_N) + RU_N) % RU_N; let acc = 0; for (let i = 0; i < ECO.ruleta.premios.length; i++) { acc += ECO.ruleta.premios[i][2]; if (x < acc) return i; } return 0; }
export const wheelPrize = (t) => { const [pesos, mult] = ECO.ruleta.premios[wheelSlot(t)]; return { pesos, mult }; };
/** ¿Puede girar? Un giro por día de Chile. */
export const canSpin = (lastSpinMs, now) => !lastSpinMs || dayOf(now) > dayOf(lastSpinMs);

// ---------- misiones ----------
const M = ECO.misiones;
export const MIN_REBOTES = M.minRebotes;
const DIA_CAMPO = { g: 'dg', r: 'dr', m: 'dm' }, SEM_CAMPO = { g: 'wg', r: 'wr', m: 'wm' };
const pickJ = (day, k) => ((day * 5 + 2 * k) % 7) % 3;
const pickW = (week, k) => ((week * 13 + 7 * k) % 17) % M.semana.de[k].length;
/** Las 3 misiones de hoy: [{ k, tipo, meta, premio, campo }]. */
export const dailyMissions = (day) => M.dia.map((c, k) => { const [tipo, meta] = c.de[pickJ(day, k)]; return { k, tipo, meta, premio: c.premio, campo: DIA_CAMPO[tipo] }; });
/** Las 3 misiones de la semana. */
export const weeklyMissions = (week) => M.semana.de.map((de, k) => { const [tipo, meta] = de[pickW(week, k)]; return { k, tipo, meta, premio: M.semana.premios[k], campo: SEM_CAMPO[tipo] }; });
export const LOGROS = M.logros.map(([id, tipo, meta, premio]) => ({ id, tipo, meta, premio }));
export const logroOf = (id) => LOGROS.find((l) => l.id === id) ?? null;

/**
 * Estadísticas después de una partida verificada de h rebotes (solo cuentan las de minRebotes o más).
 * Mismo formato que stats/<uid> de la V1: g, r, sl, d, dg, dr, dm, dc, w, wg, wr, wm, wc, ml, mo, mm.
 */
export function statsAfterMatch(old, h, startMs, now) {
  const o = old || {}, day = dayOf(now), wk = weekOf(day), mo = monthOf(day);
  const same = o.d === day, wsame = o.w === wk, msame = o.mo === mo;
  return {
    ...o, g: (o.g || 0) + 1, r: (o.r || 0) + h, sl: startMs,
    d: day, dg: (same ? o.dg || 0 : 0) + 1, dr: (same ? o.dr || 0 : 0) + h, dm: same ? Math.max(o.dm || 0, h) : h, dc: same ? o.dc || 0 : 0,
    w: wk, wg: (wsame ? o.wg || 0 : 0) + 1, wr: (wsame ? o.wr || 0 : 0) + h, wm: wsame ? Math.max(o.wm || 0, h) : h, wc: wsame ? o.wc || 0 : 0,
    ml: startMs, mo, mm: msame ? Math.max(o.mm || 0, h) : h,
  };
}

// ---------- tienda ----------
export const defaultItem = (cat) => TIENDA[cat]?.[0]?.id ?? null;
export const itemOf = (cat, id) => (CATEGORIAS.includes(cat) ? TIENDA[cat].find((i) => i.id === id) ?? null : null);
/** ¿Se puede comprar ahora? (existe, tiene precio y, si es edición limitada, no venció). */
export function buyable(cat, id, now) {
  const it = itemOf(cat, id);
  return !!it && it.price > 0 && (!it.until || now < it.until);
}
/** El personaje secreto (el de los 100 millones): da el marco dorado y el grupo VIP. */
export const SECRET_ID = TIENDA.ch.find((c) => c.secret)?.id ?? null;

// ---------- perfil ----------
/** Emblema: 'e' + forma/colores/diseño (4) + de 1 a 5 símbolos de 4 caracteres. */
export const AVATAR_RE = /^e[0-9A-Za-z_-]{4}([0-9A-Za-z_-]{4}){1,5}$/;
export const WHATSAPP_RE = /^\+[1-9][0-9]{7,14}$/;
