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

/** Marcadores públicos (sin sesión): los ve cualquiera, también el Modo Práctica de la web. Se guardan 30 s en caché. */
export function publicLeaderboards({ game, now = Date.now }) {
  const router = new Hono();
  router.get('/:kind', async (c) => {
    if (!KINDS.has(c.req.param('kind'))) throw new HttpError(422, 'marcador_invalido');
    c.header('Cache-Control', 'public, max-age=30');
    return c.json({ rows: await game.top(c.req.param('kind'), now()) });
  });
  return router;
}
