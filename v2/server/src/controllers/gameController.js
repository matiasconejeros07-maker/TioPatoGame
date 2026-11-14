// Rutas del juego (todas con sesión y firma HMAC): estado de la cuenta, cobro de partidas, racha, ruleta, misiones,
// tienda y perfil. La lógica está en GameRepository; aquí solo se valida la forma de cada petición.
import { Hono } from 'hono';
import { jsonBody } from '../middleware/signedRequest.js';
import { HttpError } from '../services/errors.js';
import { CATEGORIAS } from '../../../shared/economia.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KINDS = new Set(['g', 'a', 'w', 'm', 't']);
const isId = (v) => typeof v === 'string' && /^[a-z0-9_-]{1,40}$/.test(v);

/** @param {{ game: import('../repositories/GameRepository.js').GameRepository, now?: () => number }} deps */
export function gameController({ game, now = Date.now }) {
  const router = new Hono();
  const uid = (c) => c.get('userId');

  // Todo lo de la cuenta de una vez (al abrir el juego y después de volver de segundo plano).
  router.get('/state', async (c) => c.json(await game.state(uid(c), now())));

  // Terminar y cobrar una partida: el juego dice cuántos rebotes hizo y cuánto midió que duró; el servidor decide cuánto paga.
  router.post('/matches/:id/finish', async (c) => {
    if (!UUID_RE.test(c.req.param('id'))) throw new HttpError(422, 'partida_invalida');
    const { hits, playedMs } = jsonBody(c);
    return c.json(await game.finishMatch(uid(c), c.req.param('id'), { hits, playedMs: Number(playedMs) || 0 }, now()));
  });

  router.post('/matches/:id/played', async (c) => {
    if (!UUID_RE.test(c.req.param('id'))) throw new HttpError(422, 'partida_invalida');
    return c.json(await game.setPlayed(uid(c), c.req.param('id'), jsonBody(c).playedMs));
  });

  router.post('/streak/claim', async (c) => c.json(await game.claimStreak(uid(c), now())));
  router.post('/streak/boost', async (c) => { const { mult, from } = jsonBody(c); return c.json(await game.activateBoost(uid(c), { mult, from }, now())); });

  router.post('/wheel/spin', async (c) => c.json(await game.spinWheel(uid(c), now())));
  router.post('/wheel/claim', async (c) => c.json(await game.claimWheel(uid(c))));

  router.post('/missions/claim', async (c) => {
    const b = jsonBody(c), pedido = isId(b.logro) ? { logro: b.logro } : Number.isInteger(b.dia) ? { dia: b.dia } : Number.isInteger(b.semana) ? { semana: b.semana } : null;
    if (!pedido) throw new HttpError(422, 'mision_invalida');
    return c.json(await game.claimMission(uid(c), pedido, now()));
  });

  router.post('/shop/buy', async (c) => {
    const { cat, id } = jsonBody(c);
    if (!CATEGORIAS.includes(cat) || !isId(id)) throw new HttpError(422, 'articulo_invalido');
    return c.json(await game.buyItem(uid(c), cat, id, now()));
  });
  router.put('/shop/equip', async (c) => {
    const { cat, id } = jsonBody(c);
    if (!CATEGORIAS.includes(cat) || !isId(id)) throw new HttpError(422, 'articulo_invalido');
    return c.json(await game.equip(uid(c), cat, id));
  });

  router.put('/profile/avatar', async (c) => c.json(await game.setAvatar(uid(c), jsonBody(c).av ?? null)));
  router.put('/profile/frame', async (c) => c.json(await game.setFrame(uid(c), jsonBody(c).on === true)));

  router.get('/leaderboards/:kind/me', async (c) => {
    if (!KINDS.has(c.req.param('kind'))) throw new HttpError(422, 'marcador_invalido');
    return c.json(await game.rank(uid(c), c.req.param('kind'), now()));
  });
  return router;
}

/**
 * Marcadores públicos (sin sesión): los ve cualquiera, también el Modo Práctica de la web. Se guardan 30 s en el caché
 * del borde de Cloudflare (Cache API): con miles de jugadores mirando el marcador, la base recibe ~1 consulta cada 30 s
 * por centro de datos, no una por jugador.
 */
export function publicLeaderboards({ game, now = Date.now, edgeCache = globalThis.caches?.default ?? null }) {
  const router = new Hono();
  const cached = (fn) => async (c) => {
    const key = new Request(new URL(c.req.path, 'https://cache.tiopato').href);
    const hit = edgeCache && (await edgeCache.match(key));
    if (hit) return hit;
    const res = new Response(JSON.stringify(await fn(c)), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=30' } });
    if (edgeCache) { const put = edgeCache.put(key, res.clone()); try { c.executionCtx.waitUntil(put); } catch { await put; } }
    return res;
  };
  router.get('/hist', cached(async () => ({ counts: await game.histogram() })));
  router.get('/:kind', async (c, next) => { if (!KINDS.has(c.req.param('kind'))) throw new HttpError(422, 'marcador_invalido'); return next(); },
    cached(async (c) => ({ rows: await game.top(c.req.param('kind'), now()) })));
  return router;
}
