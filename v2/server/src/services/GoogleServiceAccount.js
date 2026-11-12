// Acceso a las APIs de Google con una cuenta de servicio (un token por permiso, reutilizado hasta que vence).
import { signJwt } from './jwt.js';
import { StoreUnavailableError } from './errors.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export class GoogleServiceAccount {
  #tokens = new Map();     // scope → { token, expiresAt }
  /** @param {{ clientEmail: string, privateKey: string, fetch?: typeof fetch, now?: () => number }} config */
  constructor({ clientEmail, privateKey, fetch: fetchFn = (...a) => fetch(...a), now = Date.now }) {
    this.clientEmail = clientEmail; this.privateKey = privateKey; this.fetch = fetchFn; this.now = now;
  }

  /** @returns {Promise<string>} valor para la cabecera Authorization */
  async authorization(scope) {
    const cached = this.#tokens.get(scope);
    if (cached && this.now() < cached.expiresAt - 60_000) return 'Bearer ' + cached.token;
    const iat = Math.floor(this.now() / 1000);
    const assertion = await signJwt('RS256', this.privateKey, {}, { iss: this.clientEmail, scope, aud: TOKEN_URL, iat, exp: iat + 3600 });
    let response;
    try {
      response = await this.fetch(TOKEN_URL, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      });
    } catch { throw new StoreUnavailableError('Google no responde'); }
    if (!response.ok) throw new StoreUnavailableError(`Google no dio acceso (${response.status})`);
    const data = await response.json();
    this.#tokens.set(scope, { token: data.access_token, expiresAt: this.now() + data.expires_in * 1000 });
    return 'Bearer ' + data.access_token;
  }
}
