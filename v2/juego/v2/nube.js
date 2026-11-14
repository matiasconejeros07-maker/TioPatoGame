// MODELO/SERVICIO · Adaptador «Firebase → API V2». El juego de la V1 habla con Firebase (lee y escribe rutas como
// wallets/<uid> o streaks/<uid>). En la app, con una sesión del servidor nuevo, este adaptador intercepta esas
// peticiones y las responde con la API V2 (PostgreSQL): las lecturas salen del estado de la cuenta y cada escritura se
// traduce a la ACCIÓN que representa (cobrar una partida, la racha, la ruleta, una misión, una compra…). El servidor
// calcula y valida todo; lo que el juego creía escribir (p. ej. «mis pesos ahora son X») solo sirve para saber qué quiso hacer.
//
// Se activa solo si la app define window.V2_NUBE = { base, sesion: { id, clave (base64), uid, nombre, key } } antes
// de cargar el juego. Sin eso, el juego sigue con Firebase como siempre (web, demo y pruebas de la V1).
import { ApiClient, ApiError } from '../../app/src/services/ApiClient.js';

const DB = 'https://nube.tiopato.local';
const AUTH_KEY = 'gana-al-tio-pato-sesion', RUN_KEY = 'nube-partidas';
const TODAY_HUSO = -3 * 3600000, DIA = 86400000;
const dayOf = (ms) => Math.floor((ms + TODAY_HUSO) / DIA), weekOf = (d) => Math.floor((d + 3) / 7);
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const isSV = (v) => v && typeof v === 'object' && v['.sv'] === 'timestamp';

/** Respuesta como la de Firebase. */
const resp = (data, status = 200) => new Response(status === 204 ? null : JSON.stringify(data ?? null), { status, headers: { 'content-type': 'application/json' } });
const denegado = () => resp({ error: 'Permission denied' }, 403);

export function instalarNube() {
  const cfg = window.V2_NUBE;
  if (!cfg || !cfg.base || !cfg.sesion || !cfg.sesion.id || !cfg.sesion.clave) return null;
  const realFetch = window.fetch.bind(window), ses = cfg.sesion, clave = b64(ses.clave);
  const api = new ApiClient({ baseUrl: cfg.base.replace(/\/+$/, ''), getSession: async () => ({ id: ses.id, key: clave }), fetch: realFetch });
  const publico = async (path) => { const r = await realFetch(cfg.base.replace(/\/+$/, '') + path); if (!r.ok) throw new ApiError(r.status, 'error'); return r.json(); };

  // El juego entra con la cuenta del servidor nuevo: se le deja una «sesión de Firebase» de mentira que nunca vence.
  window.DINERO_DB_URL = DB; window.FIREBASE_API_KEY = 'nube';
  try { localStorage.setItem(AUTH_KEY, JSON.stringify({ uid: ses.uid, name: ses.nombre, key: ses.key, email: '', id: 'nube', refresh: 'nube', exp: Date.now() + 10 * 365 * DIA })); } catch (e) {}

  // ---------- estado de la cuenta (se pide una vez y se renueva después de cada acción) ----------
  let st = null, stP = null;
  const cargar = () => (stP = api.request('GET', '/state').then((s) => { s.skew = s.now - Date.now(); st = s; return s; }).finally(() => { stP = null; }));
  const estado = () => (st ? Promise.resolve(st) : stP || cargar());
  // partidas: la hora de inicio (s) que conoce el juego ↔ el id de la partida en el servidor
  const partidas = () => { try { return JSON.parse(localStorage.getItem(RUN_KEY) || '{}'); } catch (e) { return {}; } };
  const guardarPartidas = (p) => { try { localStorage.setItem(RUN_KEY, JSON.stringify(p)); } catch (e) {} };
  let run = partidas().actual || null;                                // { s, b, r, id, e?, h?, p? }
  const guardarRun = () => { const p = partidas(); p.actual = run; guardarPartidas(p); };

  // insignias y marcos que se van viendo en los marcadores (la V1 los leía de roles/ y marco/)
  const roles = {}, marcos = {};
  const filas = (rows, campo = 's') => {
    const out = {};
    for (const r of rows) { out[r.uid] = { n: r.n, [campo]: r.s, t: 0, ...(r.a ? { a: r.a } : {}) }; if (r.r) roles[r.uid] = r.r; if (r.m) marcos[r.uid] = true; }
    return out;
  };

  // ---------- lecturas ----------
  async function leer(seg, q) {
    const s = await estado(), U = s.uid, [n0, n1, n2, n3] = seg;
    if (seg.length === 0) return null;
    if (n1 !== undefined && n1 !== U && ['wallets', 'streaks', 'stats', 'missions', 'ruleta', 'v2', 'vip', 'compradores', 'runs', 'mynames'].includes(n0)) return null;
    switch (n0) {
      case 'wallets': { const w = { ...s.wallet, ...(s.av ? { av: s.av } : {}) }; return pick(w, seg.slice(2)); }
      case 'streaks': return pick(s.streak, seg.slice(2));
      case 'stats': return pick(s.stats, seg.slice(2));
      case 'missions': return pick(Object.keys(s.missions).length ? s.missions : null, seg.slice(2));
      case 'ruleta': return pick(s.ruleta, seg.slice(2));
      case 'v2': return pick({ pu: s.v2.pu, ...(s.v2.na ? { na: true } : {}), ...(s.v2.nc ? { nc: s.v2.nc } : {}) }, seg.slice(2));
      case 'vip': return pick(s.vip ? { w: s.vip.w, n: s.name, t: s.vip.t, c: s.vip.c } : null, seg.slice(2));
      case 'compradores': return pick(s.compradores ? { n: s.compradores.n, t: 1 } : null, seg.slice(2));
      case 'runs': return pick(run, seg.slice(2));
      case 'roles': return n1 ? (n1 === U ? s.role : roles[n1]) ?? null : { ...roles, ...(s.role ? { [U]: s.role } : {}) };
      case 'marco': return n1 ? (n1 === U ? s.marco || null : marcos[n1] || null) : { ...marcos, ...(s.marco ? { [U]: true } : {}) };
      case 'names': return n1 && n1.replace(/,/g, '.') === s.key ? U : null;
      case 'mynames': return s.key ? s.key.replace(/\./g, ',') : null;
      case 'hist': { const c = (await publico('/leaderboards/hist')).counts; return n1 !== undefined ? c[+n1] || null : c; }
      case 'scores': {
        if (n1 === undefined) return filas((await publico('/leaderboards/' + (q.get('orderBy') === '"ms"' ? 't' : 'g'))).rows, q.get('orderBy') === '"ms"' ? 'ms' : 's');
        if (n1 !== U) return null;
        const fijas = partidas().fijas || [];
        const fila = s.scores.s > 0 || s.scores.ms > 0 ? { n: s.name, k: s.key, s: s.scores.s, c: s.scores.s, t: s.scores.t || 0, ms: s.scores.ms, ...(fijas.length ? { ml: fijas[fijas.length - 1] } : {}), ...(s.av ? { a: s.av } : {}) } : null;
        return pick(fila, seg.slice(2));
      }
      case 'arcade': if (n1 === undefined) return filas((await publico('/leaderboards/a')).rows); return n1 === U ? pick(s.arcade.s ? { n: s.name, s: s.arcade.s, t: 0 } : null, seg.slice(2)) : null;
      case 'weekly': case 'monthly': {
        const k = n0 === 'weekly' ? 'w' : 'm';
        if (n2 === undefined) return filas((await publico('/leaderboards/' + k)).rows);
        if (n2 !== U) return null;
        const me = await api.request('GET', `/leaderboards/${k}/me`);
        return pick(me.s ? { n: s.name, s: me.s, t: 0 } : null, seg.slice(3));
      }
      default: return null;
    }
  }
  function pick(obj, rest) { let v = obj ?? null; for (const k of rest) { if (v === null || typeof v !== 'object') return null; v = v[k] ?? null; } return v; }

  // ---------- escrituras: cada una se traduce a la acción que representa ----------
  /** Cuerpo de Firebase (PATCH/PUT en una ruta) → { 'ruta/completa': valor } */
  function aplanar(base, cuerpo, put) {
    const out = {};
    const rec = (p, v) => { if (v && typeof v === 'object' && !isSV(v) && !Array.isArray(v)) { if (put && !Object.keys(v).length) out[p] = null; for (const k in v) rec(p ? `${p}/${k}` : k, v[k]); } else out[p] = v; };
    if (put) rec(base, cuerpo); else for (const k in cuerpo || {}) rec(base ? `${base}/${k}` : k, cuerpo[k]);
    return out;
  }

  async function escribir(method, seg, cuerpo) {
    const s = await estado(), U = s.uid, base = seg.join('/');
    const w = method === 'DELETE' ? { [base]: null } : aplanar(base, cuerpo, method === 'PUT');
    const has = (p) => Object.prototype.hasOwnProperty.call(w, p), val = (p) => w[p];
    if (window.__nubeLog) console.log('nube ←', method, base || '/', JSON.stringify(w));
    const keys = Object.keys(w);
    if (keys.some((k) => k.split('/')[1] !== undefined && k.split('/')[1] !== U && !['hist', 'names', 'weekly', 'monthly'].includes(k.split('/')[0]))) return denegado();

    // empezar partida
    if (has(`runs/${U}/s`) && isSV(val(`runs/${U}/s`))) {
      const modo = window.V2 && window.V2.mode === 'arcade' ? 'arcade' : 'classic';
      const r = await api.request('POST', '/matches', { mode: modo });
      run = { s: r.s, b: r.ball, r: r.rate, id: r.matchId }; guardarRun();
      const p = partidas(); p.ids = { ...(p.ids || {}), [r.s]: r.matchId }; guardarPartidas(p);
      return true;
    }
    // terminar y cobrar la partida
    if (has(`runs/${U}/e`)) {
      if (!run || !run.id) return false;
      const h = val(`runs/${U}/h`);
      const r = await api.request('POST', `/matches/${run.id}/finish`, { hits: h });
      run = { ...run, e: Date.now(), h: r.hits, p: r.pesos }; guardarRun();
      return true;
    }
    // tiempo jugado medido por el juego (después del cobro)
    if (has(`scores/${U}/ms`) && has(`scores/${U}/ml`)) {
      const sMl = val(`scores/${U}/ml`), id = (partidas().ids || {})[sMl] || (run && run.s === sMl ? run.id : null);
      if (!id) return false;
      const inc = val(`scores/${U}/ms`) - (s.scores.ms || 0);
      await api.request('POST', `/matches/${id}/played`, { playedMs: Math.max(0, inc) });      // el juego suma su medición a lo que ya había; el servidor la usa en vez de su estimación
      const p = partidas(); p.fijas = [...(p.fijas || []), sMl].slice(-5); guardarPartidas(p);
      return true;
    }
    // racha
    if (has(`streaks/${U}/n`)) { await api.request('POST', '/streak/claim'); return true; }
    if (has(`streaks/${U}/bx`)) {
      const m = val(`streaks/${U}/bm`), from = has(`streaks/${U}/y${m}`) ? 'y' : 'x';
      await api.request('POST', '/streak/boost', { mult: m, from }); return true;
    }
    // ruleta
    if (has(`ruleta/${U}/c`)) { await api.request('POST', '/wheel/claim'); return true; }
    if (has(`ruleta/${U}/t`)) { await api.request('POST', '/wheel/spin'); return true; }

    let algo = false;
    // misiones: logros nuevos y casillas nuevas del día o de la semana
    for (const k of keys) { const m = k.match(new RegExp(`^missions/${U}/([a-z0-9]+)$`)); if (m && val(k) === true && !s.missions[m[1]]) { await api.request('POST', '/missions/claim', { logro: m[1] }); algo = true; } }
    const hoy = dayOf(Date.now() + (s.skew || 0));
    for (const [campo, tipo, vigente] of [['dc', 'dia', s.stats && s.stats.d === hoy], ['wc', 'semana', s.stats && s.stats.w === weekOf(hoy)]]) {
      if (!has(`stats/${U}/${campo}`)) continue;
      const antes = vigente ? (s.stats[campo] || 0) : 0, nuevas = (val(`stats/${U}/${campo}`) | 0) & ~antes;
      for (let k = 0; k < 3; k++) if ((nuevas >> k) & 1) { await api.request('POST', '/missions/claim', { [tipo]: k }); algo = true; }
    }
    // tienda: compras, lo equipado y el emblema
    for (const k of keys) {
      const own = k.match(new RegExp(`^wallets/${U}/own/([a-z]+)_(.+)$`));
      if (own && val(k) === true && !s.wallet.own[`${own[1]}_${own[2]}`]) { await api.request('POST', '/shop/buy', { cat: own[1], id: own[2] }); algo = true; }
    }
    for (const k of keys) {
      const eq = k.match(new RegExp(`^wallets/${U}/eq/([a-z]+)$`));
      if (eq && typeof val(k) === 'string' && s.wallet.eq[eq[1]] !== val(k)) { await api.request('PUT', '/shop/equip', { cat: eq[1], id: val(k) }); algo = true; }
    }
    if (has(`wallets/${U}/av`) && val(`wallets/${U}/av`) !== s.av) { await api.request('PUT', '/profile/avatar', { av: val(`wallets/${U}/av`) }); algo = true; }
    // marco dorado
    if (has(`marco/${U}`)) { await api.request('PUT', '/profile/frame', { on: val(`marco/${U}`) === true }); algo = true; }
    // grupo VIP
    if (method === 'DELETE' && base === `vip/${U}`) { await api.request('DELETE', '/account/vip'); algo = true; }
    else if (has(`vip/${U}/w`)) { await api.request('PUT', '/account/vip', { whatsapp: val(`vip/${U}/w`), consent: val(`vip/${U}/c`) === true }); algo = true; }
    // power-ups (V2): usar uno en la partida o comprarlo con pesos. Los packs con dinero real van por la tienda de la app.
    for (const k of keys) {
      const pu = k.match(new RegExp(`^v2/${U}/pu/([a-z]+)$`)); if (!pu) continue;
      const antes = s.v2.pu[pu[1]] || 0, ahora = val(k);
      if (ahora < antes) { if (!run || !run.id) return false; await api.request('POST', `/matches/${run.id}/powerups`, { powerupId: pu[1] }); algo = true; }
      else if (ahora > antes) { if (!has(`wallets/${U}/sp`)) return false; await api.request('POST', '/purchases/powerups', { powerupId: pu[1] }); algo = true; }
    }
    if (has(`v2/${U}/na`)) return false;                                  // «Sin anuncios» solo se entrega tras validar la compra en la tienda
    return algo || true;                                                  // lo demás (estadísticas, semanal, mensual, hist…) ya lo hizo el servidor al cobrar
  }

  // ---------- intercepción ----------
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('https://identitytoolkit.googleapis.com/') || url.startsWith('https://securetoken.googleapis.com/')) return identidad(url, init);
    if (!url.startsWith(DB)) return realFetch(input, init);
    const u = new URL(url), method = (init.method || 'GET').toUpperCase();
    const seg = decodeURIComponent(u.pathname).replace(/\.json$/, '').split('/').filter(Boolean);
    try {
      if (method === 'GET') return resp(await leer(seg, u.searchParams));
      const cuerpo = init.body ? JSON.parse(init.body) : null;
      const ok = await escribir(method, seg, cuerpo);
      await cargar();                                                     // lo que cuenta es lo que dice el servidor
      if (!ok) return denegado();
      return u.searchParams.get('print') === 'silent' ? resp(null, 204) : resp(await leer(seg, u.searchParams));
    } catch (e) {
      if (e instanceof ApiError) { if (e.status === 401) return resp({ error: 'Auth token is expired' }, 401); if (e.status >= 500) return resp({ error: 'server' }, 503); try { await cargar(); } catch (x) {} return denegado(); }
      throw new TypeError('Failed to fetch');                             // sin conexión: el juego reintenta como siempre
    }
  };
  // Firebase Authentication: la cuenta ya está abierta con Apple / Play Games; aquí solo se responde lo mínimo.
  function identidad(url, init) {
    if (url.includes('securetoken')) return resp({ id_token: 'nube', refresh_token: 'nube', expires_in: '3600000', user_id: ses.uid });
    if (url.includes('accounts:lookup')) return resp({ users: [{ localId: ses.uid, email: '', emailVerified: true }] });
    return resp({ error: { message: 'OPERATION_NOT_ALLOWED' } }, 400);
  }

  const nube = {
    api, estado, recargar: cargar,
    /** Cambiar el nombre en el servidor: 'ok' | 'taken' | 'net' (mismas respuestas que la versión de Firebase). */
    async changeName(nombre) {
      try { await api.request('PUT', '/account/name', { name: nombre }); await cargar(); return 'ok'; }
      catch (e) { return e instanceof ApiError && e.code === 'nombre_ocupado' ? 'taken' : e instanceof ApiError && e.status === 429 ? 'wait' : 'net'; }
    },
    /** Eliminar la cuenta en el servidor (y el acceso de Apple / Play Games). */
    async deleteAccount() { try { await api.request('DELETE', '/account'); localStorage.removeItem(AUTH_KEY); localStorage.removeItem(RUN_KEY); return true; } catch (e) { return false; } },
  };
  return nube;
}
