// Claves públicas de un emisor (Apple, Google), descargadas por HTTPS y guardadas en memoria una hora.
import { verifyRs256 } from './jwt.js';
import { HttpError } from './errors.js';

export class RemoteJwks {
  #jwks = null;
  #fetchedAt = 0;
  /** @param {{ url: string, fetch?: typeof fetch, now?: () => number }} config */
  constructor({ url, fetch: fetchFn = (...a) => fetch(...a), now = Date.now }) { this.url = url; this.fetch = fetchFn; this.now = now; }

  /** Verifica firma y vigencia. @returns {Promise<object|null>} los datos del token, o null si no vale */
  async verify(token) {
    if (!this.#jwks || this.now() - this.#fetchedAt > 3600_000) {
      const response = await this.fetch(this.url);
      if (!response.ok) throw new HttpError(503, 'servicio_no_disponible');
      this.#jwks = await response.json();
      this.#fetchedAt = this.now();
    }
    try {
      const claims = await verifyRs256(token, this.#jwks);
      const nowS = this.now() / 1000;
      return claims.exp > nowS && (claims.iat ?? 0) <= nowS + 60 ? claims : null;
    } catch { return null; }
  }
}
