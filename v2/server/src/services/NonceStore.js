// Recuerda los nonces ya usados para que una petición capturada no se pueda repetir.
// `claim` devuelve true solo la primera vez (SET NX con vencimiento en Redis/Valkey).

export class RedisNonceStore {
  /** @param {{ set(key: string, value: string, opts: { nx: true, ex: number }): Promise<unknown> }} redis  cliente de @upstash/redis */
  constructor(redis) { this.redis = redis; }
  async claim(key, ttlSeconds) { return (await this.redis.set('nonce:' + key, '1', { nx: true, ex: ttlSeconds })) === 'OK'; }
}

/** Para pruebas y desarrollo local. */
export class MemoryNonceStore {
  #seen = new Map();
  constructor(now = Date.now) { this.now = now; }
  async claim(key, ttlSeconds) {
    const t = this.now();
    for (const [k, exp] of this.#seen) if (exp <= t) this.#seen.delete(k);
    if (this.#seen.has(key)) return false;
    this.#seen.set(key, t + ttlSeconds * 1000);
    return true;
  }
}
