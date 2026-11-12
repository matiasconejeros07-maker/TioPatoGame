// Arma la API a partir de sus dependencias (así las pruebas pasan dobles y producción pasa las reales).
import { Hono } from 'hono';
import { signedRequest } from './middleware/signedRequest.js';
import { purchasesController } from './controllers/purchasesController.js';
import { accountController } from './controllers/accountController.js';
import { HttpError } from './services/errors.js';

export function createApp({ sessions, nonces, masterSecret, purchaseService, accounts, firebaseTokens, now }) {
  const app = new Hono();
  app.onError((error, c) => {
    if (error instanceof HttpError) return c.json({ error: error.code, ...error.details }, error.status);
    console.error(error);
    return c.json({ error: 'error_interno' }, 500);
  });
  app.get('/health', (c) => c.json({ ok: true, now: (now ?? Date.now)() }));   // la app lo usa para corregir su reloj

  const api = new Hono();
  api.use(signedRequest({ sessions, nonces, masterSecret, now }));
  api.route('/purchases', purchasesController({ purchaseService }));
  api.route('/account', accountController({ accounts, firebaseTokens }));
  app.route('/v2', api);
  return app;
}
