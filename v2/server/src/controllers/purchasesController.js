import { Hono } from 'hono';
import { jsonBody } from '../middleware/signedRequest.js';

/** @param {{ purchaseService: import('../services/PurchaseService.js').PurchaseService }} deps */
export function purchasesController({ purchaseService }) {
  const router = new Hono();
  // La app la llama al terminar una compra y, al abrir, por cada compra que haya quedado pendiente.
  router.post('/', async (c) => c.json(await purchaseService.redeem(c.get('userId'), jsonBody(c))));
  return router;
}
