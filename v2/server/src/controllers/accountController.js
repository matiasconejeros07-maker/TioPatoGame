import { Hono } from 'hono';
import { jsonBody, olvidarSesion } from '../middleware/signedRequest.js';
import { HttpError } from '../services/errors.js';
import { checkName } from '../../../shared/names.js';

/**
 * @param {{ accounts: import('../repositories/AccountRepository.js').AccountRepository, firebaseTokens: { verify(token: string): Promise<string> },
 *           identityProviders: Record<string, { revoke(token: string): Promise<void> }>, secretBox: import('../services/crypto.js').SecretBox }} deps
 */
export function accountController({ accounts, firebaseTokens, identityProviders, secretBox }) {
  const router = new Hono();
  const userId = (c) => c.get('userId');

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
    const name = checkName(jsonBody(c).name);
    if (name.problem) throw new HttpError(422, name.problem);          // nombre_invalido | nombre_ofensivo
    return c.json(await accounts.rename(c.get('userId'), name));
  });

  // Ajustes → «Eliminar cuenta».
  router.delete('/', async (c) => {
    const userId = c.get('userId');
    // Apple exige revocar «Iniciar sesión con Apple». Si Apple no responde, la cuenta se elimina igual.
    for (const identity of await accounts.identities(userId)) {
      if (!identity.refresh_token_enc) continue;
      try { await identityProviders[identity.provider].revoke(await secretBox.open(identity.refresh_token_enc)); } catch (error) { console.error('revocación SSO', error); }
    }
    await accounts.delete(userId);
    olvidarSesion(c.get('sessionId'));                                          // deja de valer al tiro (no espera los 60 s del caché)
    return c.body(null, 204);
  });

  // Cuadro VIP del personaje secreto: el jugador deja su WhatsApp.
  router.put('/vip', async (c) => {
    const { whatsapp, consent } = jsonBody(c);
    if (typeof whatsapp !== 'string' || !/^\+[1-9]\d{7,14}$/.test(whatsapp)) throw new HttpError(422, 'numero_invalido');   // +56912345678
    if (consent !== true) throw new HttpError(422, 'falta_consentimiento');
    await accounts.saveVipContact(userId(c), { whatsapp, consent });
    return c.body(null, 204);
  });
  // El jugador retira su WhatsApp del grupo VIP.
  router.delete('/vip', async (c) => { await accounts.deleteVipContact(userId(c)); return c.body(null, 204); });
  return router;
}
