// Toda petición a la API llega firmada: Signature = HMAC-SHA256(Body + Timestamp + Nonce, clave de sesión).
// Se rechaza si falta algo, si el reloj difiere en más de 30 s, si la firma no calza o si el nonce ya se usó.
import { deriveSessionKey, isFresh, isWellFormed, verify, NONCE_TTL_S } from '../../../shared/signature.js';
import { HttpError } from '../services/errors.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** @param {{ sessions: { findActive(id: string): Promise<{ id: string, userId: string }|null> }, nonces: { claim(key: string, ttl: number): Promise<boolean> }, masterSecret: string, now?: () => number }} deps */
export function signedRequest({ sessions, nonces, masterSecret, now = Date.now }) {
  return async (c, next) => {
    const sessionId = c.req.header('x-session') ?? '';
    const timestamp = c.req.header('x-timestamp'), nonce = c.req.header('x-nonce'), signature = c.req.header('x-signature');
    if (!UUID_RE.test(sessionId) || !isWellFormed({ timestamp, nonce, signature })) throw new HttpError(401, 'firma_ausente');
    if (!isFresh(timestamp, now())) throw new HttpError(401, 'reloj_desfasado');

    const session = await sessions.findActive(sessionId);
    if (!session) throw new HttpError(401, 'sesion_invalida');
    const body = await c.req.text();
    const key = await deriveSessionKey(masterSecret, session.id);
    if (!(await verify(key, body, timestamp, nonce, signature))) throw new HttpError(401, 'firma_invalida');
    // el nonce se registra después de comprobar la firma: así nadie puede «gastar» nonces ajenos
    if (!(await nonces.claim(`${session.id}:${nonce}`, NONCE_TTL_S))) throw new HttpError(401, 'peticion_repetida');

    c.set('userId', session.userId);
    c.set('body', body);
    await next();
  };
}

/** Cuerpo JSON de una petición ya verificada. */
export function jsonBody(c) {
  try { const data = JSON.parse(c.get('body') || '{}'); if (data && typeof data === 'object') return data; } catch {}
  throw new HttpError(400, 'cuerpo_invalido');
}
