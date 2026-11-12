// Avisos de reembolso de las tiendas. No llevan firma HMAC (los manda Apple o Google, no la app),
// así que cada uno se autentica a su manera antes de quitar nada.
import { Hono } from 'hono';
import { decodeJwt } from '../services/jwt.js';
import { HttpError } from '../services/errors.js';

const APPLE_REFUND_TYPES = new Set(['REFUND', 'REVOKE']);

/**
 * @param {{ purchaseService: import('../services/PurchaseService.js').PurchaseService,
 *           googlePush: { verify(token: string): Promise<object|null> }, googlePushAudience: string, googlePushEmail: string, packageName: string }} deps
 */
export function webhooksController({ purchaseService, googlePush, googlePushAudience, googlePushEmail, packageName }) {
  const router = new Hono();

  // App Store Server Notifications V2. El aviso solo se usa como pista: se saca el id de la transacción y
  // se le pregunta a Apple si de verdad fue reembolsada. Un aviso falso no logra quitarle nada a nadie.
  router.post('/apple', async (c) => {
    let transactionId, type;
    try {
      const notification = decodeJwt((await c.req.json()).signedPayload).payload;
      type = notification.notificationType;
      transactionId = decodeJwt(notification.data.signedTransactionInfo).payload.transactionId;
    } catch { throw new HttpError(400, 'cuerpo_invalido'); }
    if (APPLE_REFUND_TYPES.has(type)) await purchaseService.refundApple(String(transactionId));
    return c.json({ ok: true });       // 200 = recibido (si Apple estaba caído se respondió 503 y Apple reintenta)
  });

  // Real-time Developer Notifications (Google Pub/Sub, entrega «push» con autenticación).
  // Google firma cada entrega con un token; se comprueba la firma, a quién va dirigido y qué cuenta de servicio lo envía.
  router.post('/google', async (c) => {
    const token = (c.req.header('authorization') ?? '').replace(/^Bearer /, '');
    const claims = token ? await googlePush.verify(token) : null;
    if (!claims || !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) || claims.aud !== googlePushAudience
      || claims.email !== googlePushEmail || claims.email_verified !== true) throw new HttpError(401, 'aviso_no_autenticado');
    let event;
    try { event = JSON.parse(atob((await c.req.json()).message.data)); } catch { throw new HttpError(400, 'cuerpo_invalido'); }
    const voided = event.voidedPurchaseNotification;
    if (event.packageName === packageName && voided) await purchaseService.refundGoogle({ orderId: voided.orderId, purchaseToken: voided.purchaseToken });
    return c.json({ ok: true });
  });
  return router;
}
