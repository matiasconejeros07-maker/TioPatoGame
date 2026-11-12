import { Hono } from 'hono';
import { HttpError } from '../services/errors.js';

/** Rutas sin sesión (todavía no hay clave para firmar): las protege la atestación, el desafío de un solo uso y el límite por IP. */
export function authController({ authService, rateLimiter }) {
  const router = new Hono();
  router.use(async (c, next) => {
    const ip = c.req.header('cf-connecting-ip') ?? 'desconocida';
    if (!(await rateLimiter.allow('auth:' + ip, 20, 60))) throw new HttpError(429, 'demasiados_intentos');
    await next();
  });
  router.post('/challenge', async (c) => c.json({ challenge: await authService.newChallenge() }));
  router.post('/login', async (c) => {
    let body;
    try { body = await c.req.json(); } catch { throw new HttpError(400, 'cuerpo_invalido'); }
    return c.json(await authService.login(body ?? {}));
  });
  return router;
}
