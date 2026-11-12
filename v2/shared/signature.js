// Firma de peticiones, compartida por la app y el servidor (usa WebCrypto: WebView, Workers y Node).
//   Signature = HMAC-SHA256(Body + Timestamp + Nonce, claveDeSesión)   → en hexadecimal
// La clave es de cada sesión (se entrega al iniciar sesión, después de la atestación) y vive en el
// Keystore/Keychain: nunca va escrita en el código de la app.

export const MAX_SKEW_MS = 30_000;            // se rechaza un desfase de reloj mayor a 30 s
export const NONCE_TTL_S = 90;                // cuánto se recuerda un nonce (más que la ventana completa de ±30 s)

const TIMESTAMP_RE = /^\d{13}$/;              // milisegundos Unix
const NONCE_RE = /^[A-Za-z0-9_-]{22}$/;       // 16 bytes al azar en base64url
const SIGNATURE_RE = /^[0-9a-f]{64}$/;
const encoder = new TextEncoder();

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16));
const hmacKey = (keyBytes, usage) =>
  crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);

export function newNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {Uint8Array} keyBytes @param {string} body @param {string} timestamp @param {string} nonce */
export async function sign(keyBytes, body, timestamp, nonce) {
  const key = await hmacKey(keyBytes, 'sign');
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(body + timestamp + nonce)));
}

export const isWellFormed = ({ timestamp, nonce, signature }) =>
  TIMESTAMP_RE.test(timestamp ?? '') && NONCE_RE.test(nonce ?? '') && SIGNATURE_RE.test(signature ?? '');

export const isFresh = (timestamp, now = Date.now()) => Math.abs(now - Number(timestamp)) <= MAX_SKEW_MS;

/** Comparación en tiempo constante (la hace WebCrypto). */
export async function verify(keyBytes, body, timestamp, nonce, signature) {
  if (!isWellFormed({ timestamp, nonce, signature })) return false;
  const key = await hmacKey(keyBytes, 'verify');
  return crypto.subtle.verify('HMAC', key, fromHex(signature), encoder.encode(body + timestamp + nonce));
}

/** Clave de una sesión: HMAC(secreto maestro del servidor, id de sesión). Solo la calcula el servidor. */
export async function deriveSessionKey(masterSecret, sessionId) {
  const key = await hmacKey(encoder.encode(masterSecret), 'sign');
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode('session:' + sessionId)));
}
