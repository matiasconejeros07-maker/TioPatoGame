// SSO oficial: quién es el jugador según Apple (iOS) o Google Play Games (Android).
// Cada proveedor recibe lo que entregó el SDK nativo y devuelve un identificador estable de la persona.
import { signJwt } from './jwt.js';
import { RemoteJwks } from './RemoteJwks.js';
import { sha256Hex } from './crypto.js';
import { HttpError } from './errors.js';

const invalid = () => new HttpError(401, 'identidad_invalida');
const form = (data) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data) });

/** Sign in with Apple. */
export class AppleIdentityProvider {
  name = 'apple';
  /**
   * @param {{ clientId: string, teamId: string, keyId: string, privateKey: string, fetch?: typeof fetch, now?: () => number }} config
   *   clientId = bundle id · keyId/privateKey = clave «Sign in with Apple» (Certificates, Identifiers & Profiles → Keys)
   */
  constructor(config) {
    this.config = { fetch: (...a) => fetch(...a), now: Date.now, ...config };
    this.jwks = new RemoteJwks({ url: 'https://appleid.apple.com/auth/keys', fetch: this.config.fetch, now: this.config.now });
  }

  #clientSecret() {
    const { teamId, keyId, privateKey, clientId, now } = this.config;
    const iat = Math.floor(now() / 1000);
    return signJwt('ES256', privateKey, { kid: keyId }, { iss: teamId, iat, exp: iat + 300, aud: 'https://appleid.apple.com', sub: clientId });
  }

  /** @returns {Promise<{ subject: string, refreshToken: string|null }>} */
  async verify({ identityToken, authorizationCode }, challenge) {
    if (typeof identityToken !== 'string') throw invalid();
    const claims = await this.jwks.verify(identityToken);
    // `nonce` ata el token a ESTE intento de inicio de sesión: un token robado de otro intento no sirve.
    if (!claims || claims.iss !== 'https://appleid.apple.com' || claims.aud !== this.config.clientId
      || typeof claims.sub !== 'string' || !claims.sub || claims.nonce !== await sha256Hex(challenge)) throw invalid();
    return { subject: claims.sub, refreshToken: await this.#refreshToken(authorizationCode) };
  }

  /** El refresh token solo se usa para revocar el acceso si la cuenta se elimina. Si Apple no lo da, se entra igual. */
  async #refreshToken(authorizationCode) {
    if (typeof authorizationCode !== 'string') return null;
    try {
      const response = await this.config.fetch('https://appleid.apple.com/auth/token', form({
        client_id: this.config.clientId, client_secret: await this.#clientSecret(), code: authorizationCode, grant_type: 'authorization_code' }));
      return response.ok ? (await response.json()).refresh_token ?? null : null;
    } catch { return null; }
  }

  /** Al eliminar la cuenta (lo exige Apple): la app deja de figurar en «Iniciar sesión con Apple» del jugador. */
  async revoke(refreshToken) {
    await this.config.fetch('https://appleid.apple.com/auth/revoke', form({
      client_id: this.config.clientId, client_secret: await this.#clientSecret(), token: refreshToken, token_type_hint: 'refresh_token' }));
  }
}

/** Google Play Games Services v2: la app pide un «server auth code» y el servidor lo canjea por el id del jugador. */
export class PlayGamesIdentityProvider {
  name = 'google_play_games';
  /** @param {{ clientId: string, clientSecret: string, fetch?: typeof fetch }} config  cliente OAuth «Aplicación web» enlazado a Play Games */
  constructor(config) { this.config = { fetch: (...a) => fetch(...a), ...config }; }

  /** @returns {Promise<{ subject: string, refreshToken: null }>} */
  async verify({ serverAuthCode }) {
    if (typeof serverAuthCode !== 'string') throw invalid();
    let player;
    try {
      const token = await this.config.fetch('https://oauth2.googleapis.com/token', form({
        client_id: this.config.clientId, client_secret: this.config.clientSecret, code: serverAuthCode, grant_type: 'authorization_code', redirect_uri: '' }));
      if (token.status >= 500) throw new HttpError(503, 'servicio_no_disponible');
      if (!token.ok) throw invalid();
      const { access_token: accessToken } = await token.json();
      const me = await this.config.fetch('https://games.googleapis.com/games/v1/players/me', { headers: { authorization: 'Bearer ' + accessToken } });
      if (!me.ok) throw invalid();
      player = await me.json();
    } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(503, 'servicio_no_disponible'); }
    if (typeof player.playerId !== 'string' || !player.playerId) throw invalid();
    return { subject: player.playerId, refreshToken: null };
  }

  async revoke() {}
}
