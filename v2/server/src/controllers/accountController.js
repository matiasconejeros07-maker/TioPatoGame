import { Hono } from 'hono';
import { jsonBody } from '../middleware/signedRequest.js';
import { HttpError } from '../services/errors.js';
import { parseName } from '../../../shared/names.js';

/** @param {{ accounts: import('../models/AccountRepository.js').AccountRepository, firebaseTokens: { verify(token: string): Promise<string> } }} deps */
export function accountController({ accounts, firebaseTokens }) {
  const router = new Hono();

  // Recuperar la cuenta de la V1: la app inicia sesión en Firebase con el nombre/correo y contraseña de siempre
  // y manda aquí el ID token que le dio Firebase.
  router.post('/link-legacy', async (c) => {
    const { firebaseIdToken } = jsonBody(c);
    if (typeof firebaseIdToken !== 'string') throw new HttpError(400, 'cuerpo_invalido');
    const firebaseUid = await firebaseTokens.verify(firebaseIdToken);
    return c.json({ userId: await accounts.linkLegacy(c.get('userId'), firebaseUid) });
  });

  // Ajustes → «Cambiar nombre» (una vez cada 30 días).
  router.put('/name', async (c) => {
    const name = parseName(jsonBody(c).name);
    if (!name) throw new HttpError(422, 'nombre_invalido');
    return c.json(await accounts.rename(c.get('userId'), name));
  });

  // Ajustes → «Eliminar cuenta».
  router.delete('/', async (c) => { await accounts.delete(c.get('userId')); return c.body(null, 204); });
  return router;
}
