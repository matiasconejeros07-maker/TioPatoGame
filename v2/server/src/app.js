// Arma la API a partir de sus dependencias (así las pruebas pasan dobles y producción pasa las reales).
import { Hono } from 'hono';
import { signedRequest } from './middleware/signedRequest.js';
import { authController } from './controllers/authController.js';
import { purchasesController } from './controllers/purchasesController.js';
import { accountController } from './controllers/accountController.js';
import { matchesController } from './controllers/matchesController.js';
import { webhooksController } from './controllers/webhooksController.js';
import { HttpError } from './services/errors.js';

const MAX_BODY_BYTES = 16 * 1024;      // ninguna petición legítima se acerca (las atestaciones pesan ~6 KB)

export function createApp(deps) {
  const { sessions, nonces, masterSecret, now } = deps;
  const app = new Hono();
  app.onError((error, c) => {
    if (error instanceof HttpError) {
      if (error.status === 403) console.warn(error.code, error.message);     // por qué falló una atestación (no se le dice al cliente)
      return c.json({ error: error.code, ...error.details }, error.status);
    }
    console.error(error);
    return c.json({ error: 'error_interno' }, 500);
  });
  app.use(async (c, next) => {
    if (Number(c.req.header('content-length') ?? 0) > MAX_BODY_BYTES) throw new HttpError(413, 'cuerpo_muy_grande');
    await next();
  });
  app.get('/health', (c) => c.json({ ok: true, now: (now ?? Date.now)() }));   // la app lo usa para corregir su reloj

  // Sin sesión: inicio de sesión (atestación + SSO) y avisos de las tiendas.
  app.route('/auth', authController(deps));
  app.route('/webhooks', webhooksController(deps));

  // Con sesión: toda petición va firmada con HMAC.
  const api = new Hono();
  api.use(signedRequest({ sessions, nonces, masterSecret, now }));
  api.route('/purchases', purchasesController(deps));
  api.route('/account', accountController(deps));
  api.route('/matches', matchesController(deps));
  app.route('/v2', api);
  return app;
}
