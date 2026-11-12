// Valida una compra de Android preguntándole directamente a Google (Android Publisher API) y, una vez
// entregada, la «consume» desde el servidor: así el mismo token no sirve dos veces ni un APK parchado
// (Lucky Patcher y similares) puede fabricar compras.
import { GoogleServiceAccount } from './GoogleServiceAccount.js';
import { InvalidPurchaseError, StoreUnavailableError } from './errors.js';

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export class GooglePlayVerifier {
  /**
   * @param {{ packageName: string, clientEmail: string, privateKey: string, allowSandbox?: boolean,
   *           fetch?: typeof fetch, now?: () => number }} config  cuenta de servicio con permiso en Play Console
   */
  constructor(config) {
    this.config = { fetch: (...a) => fetch(...a), now: Date.now, allowSandbox: false, ...config };
    this.account = config.account ?? new GoogleServiceAccount(this.config);
  }

  #authorization() { return this.account.authorization(SCOPE); }

  async #call(url, init) {
    try { return await this.config.fetch(url, init); } catch (e) { throw new StoreUnavailableError('Google no responde'); }
  }

  #url(productId, purchaseToken, action = '') {
    return `${API}/${this.config.packageName}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}${action}`;
  }

  /** @returns {Promise<{ transactionId: string, productId: string, quantity: number, environment: string, receipt: object, purchaseToken: string }>} */
  async verify({ purchaseToken, productId, userId, consumable = true }) {
    if (typeof purchaseToken !== 'string' || purchaseToken.length < 20 || purchaseToken.length > 2000) throw new InvalidPurchaseError('token de compra inválido');
    const response = await this.#call(this.#url(productId, purchaseToken), { headers: { authorization: await this.#authorization() } });
    if (response.status === 400 || response.status === 404 || response.status === 410) throw new InvalidPurchaseError('Google no conoce esa compra');
    if (!response.ok) throw new StoreUnavailableError(`Google respondió ${response.status}`);

    const purchase = await response.json();
    if (purchase.purchaseState !== 0) throw new InvalidPurchaseError('la compra no está pagada');   // 1 = anulada · 2 = pendiente
    if (!purchase.orderId) throw new InvalidPurchaseError('la compra no tiene número de orden');
    if (consumable && purchase.obfuscatedExternalAccountId !== userId) throw new InvalidPurchaseError('la compra es de otra cuenta');
    const environment = purchase.purchaseType === 0 ? 'sandbox' : 'production';                      // 0 = comprador de prueba
    if (environment === 'sandbox' && !this.config.allowSandbox) throw new InvalidPurchaseError('compra de prueba');
    return { transactionId: purchase.orderId, productId, quantity: purchase.quantity ?? 1, environment, receipt: purchase, purchaseToken, consumable };
  }

  /**
   * Cierra la compra en Google Play: un consumible se consume (deja comprar el pack otra vez); una compra
   * permanente se confirma (si no, Google la reembolsa a los 3 días). Repetirlo no hace daño.
   */
  async close({ productId, purchaseToken, consumable = true }) {
    const response = await this.#call(this.#url(productId, purchaseToken, consumable ? ':consume' : ':acknowledge'), {
      method: 'POST', headers: { authorization: await this.#authorization(), 'content-type': 'application/json' }, body: consumable ? undefined : '{}',
    });
    if (!response.ok) throw new StoreUnavailableError(`Google no cerró la compra (${response.status})`);
  }
}
