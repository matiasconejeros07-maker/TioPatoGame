// Comprueba un ID token de Firebase Authentication (la sesión de la V1). Se usa una sola vez por jugador:
// para demostrar que es el dueño de su cuenta antigua al enlazarla con Apple / Google Play Games.
import { verifyRs256 } from './jwt.js';
import { HttpError } from './errors.js';

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const MAX_AUTH_AGE_S = 10 * 60;     // tiene que haber escrito su contraseña hace poco (no vale una sesión vieja robada)

export class FirebaseTokenVerifier {
  #jwks = null;
  #fetchedAt = 0;

  /** @param {{ projectId: string, fetch?: typeof fetch, now?: () => number }} config */
  constructor(config) { this.config = { fetch: (...a) => fetch(...a), now: Date.now, ...config }; }

  async #keys() {
    if (!this.#jwks || this.config.now() - this.#fetchedAt > 3600_000) {
      const response = await this.config.fetch(JWKS_URL);
      if (!response.ok) throw new HttpError(503, 'firebase_no_disponible');
      this.#jwks = await response.json();
      this.#fetchedAt = this.config.now();
    }
    return this.#jwks;
  }

  /** @returns {Promise<string>} el uid de Firebase */
  async verify(idToken) {
    let claims;
    try { claims = await verifyRs256(idToken, await this.#keys()); }
    catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(401, 'sesion_antigua_invalida'); }
    const nowS = this.config.now() / 1000;
    const { projectId } = this.config;
    const valid = claims.aud === projectId && claims.iss === `https://securetoken.google.com/${projectId}`
      && typeof claims.sub === 'string' && claims.sub.length > 0 && claims.exp > nowS && claims.iat <= nowS + 60
      && nowS - claims.auth_time <= MAX_AUTH_AGE_S;
    if (!valid) throw new HttpError(401, 'sesion_antigua_invalida');
    return claims.sub;
  }
}
