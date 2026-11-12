import { Hono } from 'hono';
import { jsonBody } from '../middleware/signedRequest.js';

/** @param {{ purchaseService: import('../services/PurchaseService.js').PurchaseService }} deps */
export function purchasesController({ purchaseService }) {
  const router = new Hono();
  // Lo que la cuenta tiene comprado: power-ups y derechos permanentes («Sin anuncios»). La app lo pide al abrir.
  router.get('/', async (c) => c.json(await purchaseService.owned(c.get('userId'))));
  // La app la llama al terminar una compra, al restaurar y, al abrir, por cada compra que haya quedado pendiente.
  router.post('/', async (c) => c.json(await purchaseService.redeem(c.get('userId'), jsonBody(c))));
  return router;
}
