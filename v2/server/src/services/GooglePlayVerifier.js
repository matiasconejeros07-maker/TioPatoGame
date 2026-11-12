// Valida una compra de Android preguntándole directamente a Google (Android Publisher API) y, una vez
// entregada, la «consume» desde el servidor: así el mismo token no sirve dos veces ni un APK parchado
// (Lucky Patcher y similares) puede fabricar compras.
import { signJwt } from './jwt.js';
import { InvalidPurchaseError, StoreUnavailableError } from './errors.js';

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export class GooglePlayVerifier {
  #accessToken = null;
  #expiresAt = 0;

  /**
   * @param {{ packageName: string, clientEmail: string, privateKey: string, allowSandbox?: boolean,
   *           fetch?: typeof fetch, now?: () => number }} config  cuenta de servicio con permiso en Play Console
   */
  constructor(config) { this.config = { fetch: (...a) => fetch(...a), now: Date.now, allowSandbox: false, ...config }; }

  async #authorization() {
    const { clientEmail, privateKey, now } = this.config;
    if (!this.#accessToken || now() > this.#expiresAt - 60_000) {
      const iat = Math.floor(now() / 1000);
      const assertion = await signJwt('RS256', privateKey, {}, { iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 });
      const response = await this.#call(TOKEN_URL, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      });
      if (!response.ok) throw new StoreUnavailableError(`Google no dio acceso (${response.status})`);
      const data = await response.json();
      this.#accessToken = data.access_token;
      this.#expiresAt = now() + data.expires_in * 1000;
    }
    return 'Bearer ' + this.#accessToken;
  }

  async #call(url, init) {
    try { return await this.config.fetch(url, init); } catch (e) { throw new StoreUnavailableError('Google no responde'); }
  }

  #url(productId, purchaseToken, action = '') {
    return `${API}/${this.config.packageName}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}${action}`;
  }

  /** @returns {Promise<{ transactionId: string, productId: string, quantity: number, environment: string, receipt: object, purchaseToken: string }>} */
  async verify({ purchaseToken, productId, userId }) {
    if (typeof purchaseToken !== 'string' || purchaseToken.length < 20 || purchaseToken.length > 2000) throw new InvalidPurchaseError('token de compra inválido');
    const response = await this.#call(this.#url(productId, purchaseToken), { headers: { authorization: await this.#authorization() } });
    if (response.status === 400 || response.status === 404 || response.status === 410) throw new InvalidPurchaseError('Google no conoce esa compra');
    if (!response.ok) throw new StoreUnavailableError(`Google respondió ${response.status}`);

    const purchase = await response.json();
    if (purchase.purchaseState !== 0) throw new InvalidPurchaseError('la compra no está pagada');   // 1 = anulada · 2 = pendiente
    if (!purchase.orderId) throw new InvalidPurchaseError('la compra no tiene número de orden');
    if (purchase.obfuscatedExternalAccountId !== userId) throw new InvalidPurchaseError('la compra es de otra cuenta');
    const environment = purchase.purchaseType === 0 ? 'sandbox' : 'production';                      // 0 = comprador de prueba
    if (environment === 'sandbox' && !this.config.allowSandbox) throw new InvalidPurchaseError('compra de prueba');
    return { transactionId: purchase.orderId, productId, quantity: purchase.quantity ?? 1, environment, receipt: purchase, purchaseToken };
  }

  /** Consume la compra en Google Play (deja comprar el pack otra vez). Repetirlo no hace daño. */
  async close({ productId, purchaseToken }) {
    const response = await this.#call(this.#url(productId, purchaseToken, ':consume'), { method: 'POST', headers: { authorization: await this.#authorization() } });
    if (!response.ok) throw new StoreUnavailableError(`Google no consumió la compra (${response.status})`);
  }
}
