// Datos de vida corta en Redis/Valkey: nonces usados, desafíos de inicio de sesión y límites de frecuencia.
// `redis` es el cliente de @upstash/redis (en las pruebas, MemoryRedis, que imita los mismos cuatro comandos).
import { b64url } from './jwt.js';

/** Recuerda los nonces ya usados para que una petición capturada no se pueda repetir. */
export class NonceStore {
  constructor(redis) { this.redis = redis; }
  /** @returns {Promise<boolean>} true solo la primera vez */
  async claim(key, ttlSeconds) { return (await this.redis.set('nonce:' + key, 1, { nx: true, ex: ttlSeconds })) === 'OK'; }
}

/** Desafíos de un solo uso: lo que el teléfono tiene que firmar/atestar para iniciar sesión. */
export class ChallengeStore {
  constructor(redis, ttlSeconds = 300) { this.redis = redis; this.ttlSeconds = ttlSeconds; }
  async issue() {
    const challenge = b64url(crypto.getRandomValues(new Uint8Array(32)));
    await this.redis.set('challenge:' + challenge, 1, { ex: this.ttlSeconds });
    return challenge;
  }
  /** @returns {Promise<boolean>} true si existía (y deja de existir: no se puede reutilizar) */
  async consume(challenge) {
    if (typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return false;
    return (await this.redis.getdel('challenge:' + challenge)) != null;
  }
}

/** Límite de frecuencia por ventana fija (segunda barrera, detrás del WAF de Cloudflare). */
export class RateLimiter {
  constructor(redis) { this.redis = redis; }
  /** @returns {Promise<boolean>} false si ya se pasó del límite en esta ventana */
  async allow(key, limit, windowSeconds) {
    const count = await this.redis.incr('rate:' + key);
    if (count === 1) await this.redis.expire('rate:' + key, windowSeconds);
    return count <= limit;
  }
}

/** Redis de mentira para pruebas y desarrollo local. */
export class MemoryRedis {
  #data = new Map();      // clave → { value, expiresAt }
  constructor(now = Date.now) { this.now = now; }
  #get(key) {
    const entry = this.#data.get(key);
    if (entry && entry.expiresAt <= this.now()) { this.#data.delete(key); return undefined; }
    return entry;
  }
  async set(key, value, { nx = false, ex } = {}) {
    if (nx && this.#get(key)) return null;
    this.#data.set(key, { value, expiresAt: ex ? this.now() + ex * 1000 : Infinity });
    return 'OK';
  }
  async getdel(key) { const entry = this.#get(key); this.#data.delete(key); return entry ? entry.value : null; }
  async incr(key) { const entry = this.#get(key) ?? { value: 0, expiresAt: Infinity }; entry.value++; this.#data.set(key, entry); return entry.value; }
  async expire(key, seconds) { const entry = this.#get(key); if (entry) entry.expiresAt = this.now() + seconds * 1000; return entry ? 1 : 0; }
}
