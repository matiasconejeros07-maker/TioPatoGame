// Toda petición a la API llega firmada: Signature = HMAC-SHA256(Body + Timestamp + Nonce, clave de sesión).
// Se rechaza si falta algo, si el reloj difiere en más de 30 s, si la firma no calza o si el nonce ya se usó.
//
// Pensado para miles de jugadores a la vez:
//  · Límite por sesión (una app modificada no puede martillar la base): `limiter.allow(clave)`.
//  · El nonce (antirrepetición) se exige en las peticiones que CAMBIAN algo. Una lectura repetida no cambia nada y así
//    no se gasta un comando de Redis por cada lectura (a escala, Redis se cobra por comando).
//  · Las sesiones válidas se recuerdan 60 s en la memoria del Worker: no se consulta la base en cada petición.
//    (Al cerrar sesión o eliminar la cuenta, `olvidarSesion` la saca al tiro en ese Worker; en los demás vence sola en 60 s.)
import { deriveSessionKey, isFresh, isWellFormed, verify, NONCE_TTL_S } from '../../../shared/signature.js';
import { HttpError } from '../services/errors.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BODY = 16 * 1024, CACHE_MS = 60_000, CACHE_MAX = 5000;
const cache = new Map();                                                        // id de sesión → { session, key, hasta }
export const olvidarSesion = (id) => cache.delete(id);

/** @param {{ sessions: { findActive(id: string): Promise<{ id: string, userId: string }|null> }, nonces: { claim(key: string, ttl: number): Promise<boolean> }, limiter?: { allow(key: string): Promise<boolean> }, masterSecret: string, now?: () => number, cacheSessions?: boolean }} deps */
export function signedRequest({ sessions, nonces, limiter, masterSecret, now = Date.now, cacheSessions = false }) {
  return async (c, next) => {
    const sessionId = c.req.header('x-session') ?? '';
    const timestamp = c.req.header('x-timestamp'), nonce = c.req.header('x-nonce'), signature = c.req.header('x-signature');
    if (!UUID_RE.test(sessionId) || !isWellFormed({ timestamp, nonce, signature })) throw new HttpError(401, 'firma_ausente');
    if (!isFresh(timestamp, now())) throw new HttpError(401, 'reloj_desfasado');

    let hit = cacheSessions ? cache.get(sessionId) : null;
    if (!hit || hit.hasta < Date.now()) {
      const session = await sessions.findActive(sessionId);
      if (!session) { cache.delete(sessionId); throw new HttpError(401, 'sesion_invalida'); }
      hit = { session, key: await deriveSessionKey(masterSecret, session.id), hasta: Date.now() + CACHE_MS };
      if (cacheSessions) { if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value); cache.set(sessionId, hit); }
    }
    const { session, key } = hit;
    const body = await c.req.text();
    if (body.length > MAX_BODY) throw new HttpError(413, 'cuerpo_muy_grande');
    if (!(await verify(key, body, timestamp, nonce, signature))) throw new HttpError(401, 'firma_invalida');
    if (limiter && !(await limiter.allow('s:' + session.id))) throw new HttpError(429, 'demasiadas_peticiones');
    // el nonce se registra después de comprobar la firma: así nadie puede «gastar» nonces ajenos
    if (c.req.method !== 'GET' && !(await nonces.claim(`${session.id}:${nonce}`, NONCE_TTL_S))) throw new HttpError(401, 'peticion_repetida');

    c.set('userId', session.userId);
    c.set('sessionId', session.id);
    c.set('body', body);
    await next();
  };
}

/** Cuerpo JSON de una petición ya verificada. */
export function jsonBody(c) {
  try { const data = JSON.parse(c.get('body') || '{}'); if (data && typeof data === 'object') return data; } catch {}
  throw new HttpError(400, 'cuerpo_invalido');
}
