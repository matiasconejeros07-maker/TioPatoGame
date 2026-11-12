import { Hono } from 'hono';
import { jsonBody } from '../middleware/signedRequest.js';
import { HttpError } from '../services/errors.js';
import { POWERUPS } from '../../../shared/catalog.js';

/** @param {{ purchaseService: import('../services/PurchaseService.js').PurchaseService }} deps */
export function purchasesController({ purchaseService }) {
  const router = new Hono();
  // Lo que la cuenta tiene comprado: power-ups y derechos permanentes («Sin anuncios»). La app lo pide al abrir.
  router.get('/', async (c) => c.json(await purchaseService.owned(c.get('userId'))));
  // La app la llama al terminar una compra, al restaurar y, al abrir, por cada compra que haya quedado pendiente.
  router.post('/', async (c) => c.json(await purchaseService.redeem(c.get('userId'), jsonBody(c))));
  // Tienda → comprar un power-up con pesos del juego.
  router.post('/powerups', async (c) => {
    const { powerupId } = jsonBody(c);
    if (!Object.hasOwn(POWERUPS, powerupId ?? '')) throw new HttpError(422, 'powerup_invalido');
    return c.json(await purchaseService.buyWithCoins(c.get('userId'), powerupId));
  });
  return router;
}
