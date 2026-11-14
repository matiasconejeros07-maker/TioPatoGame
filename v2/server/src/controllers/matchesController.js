import { Hono } from 'hono';
import { jsonBody } from '../middleware/signedRequest.js';
import { HttpError } from '../services/errors.js';
import { POWERUPS, isMatchMode } from '../../../shared/catalog.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** @param {{ matches: import('../repositories/MatchRepository.js').MatchRepository, game: import('../repositories/GameRepository.js').GameRepository }} deps */
export function matchesController({ matches, game, now = Date.now }) {
  const router = new Hono();

  // Empezar partida: classic (sin power-ups de pago, ranking principal) o arcade (con power-ups).
  router.post('/', async (c) => {
    const { mode } = jsonBody(c);
    if (!isMatchMode(mode)) throw new HttpError(422, 'modo_invalido');
    return c.json(await game.startMatch(c.get('userId'), mode, now()));      // anota la pelota y el multiplicador con que empezó
  });

  // El jugador toca un power-up: se descuenta en este instante.
  router.post('/:id/powerups', async (c) => {
    const { powerupId } = jsonBody(c);
    if (!UUID_RE.test(c.req.param('id')) || !Object.hasOwn(POWERUPS, powerupId ?? '')) throw new HttpError(422, 'powerup_invalido');
    return c.json(await matches.usePowerUp(c.get('userId'), c.req.param('id'), powerupId));
  });
  return router;
}
