// Valida una compra de iOS preguntándole directamente a Apple (App Store Server API).
// No se confía en nada de lo que mande el teléfono salvo el id de la transacción: los datos de la compra
// los entrega Apple por HTTPS, por eso un recibo falso (IAP Cracker y similares) no pasa.
import { decodeJwt, signJwt } from './jwt.js';
import { InvalidPurchaseError, StoreUnavailableError } from './errors.js';

const HOSTS = [
  ['production', 'https://api.storekit.itunes.apple.com'],
  ['sandbox', 'https://api.storekit-sandbox.itunes.apple.com'],
];

export class AppleStoreVerifier {
  /**
   * @param {{ issuerId: string, keyId: string, privateKey: string, bundleId: string, allowSandbox?: boolean,
   *           fetch?: typeof fetch, now?: () => number }} config  credenciales de App Store Connect → Usuarios y acceso → Integraciones
   */
  constructor(config) { this.config = { fetch: (...a) => fetch(...a), now: Date.now, allowSandbox: false, ...config }; }

  #token() {
    const { issuerId, keyId, privateKey, bundleId, now } = this.config;
    const iat = Math.floor(now() / 1000);
    return signJwt('ES256', privateKey, { kid: keyId }, { iss: issuerId, iat, exp: iat + 300, aud: 'appstoreconnect-v1', bid: bundleId });
  }

  /** Pregunta a Apple por una transacción. @returns {Promise<{ tx: object, environment: string } | null>} null si Apple no la conoce */
  async #lookup(transactionId) {
    if (!/^\d{1,32}$/.test(transactionId ?? '')) throw new InvalidPurchaseError('id de transacción inválido');
    const authorization = 'Bearer ' + (await this.#token());
    for (const [environment, host] of HOSTS) {
      if (environment === 'sandbox' && !this.config.allowSandbox) break;
      let response;
      try { response = await this.config.fetch(`${host}/inApps/v1/transactions/${transactionId}`, { headers: { authorization } }); }
      catch (e) { throw new StoreUnavailableError('Apple no responde'); }
      if (response.status === 404) continue;                     // no existe en este ambiente: se prueba el siguiente
      if (!response.ok) throw new StoreUnavailableError(`Apple respondió ${response.status}`);
      return { tx: decodeJwt((await response.json()).signedTransactionInfo).payload, environment };
    }
    return null;
  }

  /** @returns {Promise<{ transactionId: string, productId: string, quantity: number, environment: string, receipt: object }>} */
  async verify({ transactionId, productId, userId, consumable = true }) {
    const found = await this.#lookup(transactionId);
    if (!found) throw new InvalidPurchaseError('Apple no conoce esa transacción');
    const { tx, environment } = found;
    if (tx.bundleId !== this.config.bundleId) throw new InvalidPurchaseError('la compra es de otra app');
    if (tx.productId !== productId) throw new InvalidPurchaseError('la compra es de otro producto');
    if (tx.type !== (consumable ? 'Consumable' : 'Non-Consumable')) throw new InvalidPurchaseError('tipo de producto inesperado');
    if (tx.revocationDate) throw new InvalidPurchaseError('la compra fue reembolsada');
    // Un consumible es de la cuenta que lo compró. Una compra permanente es del Apple ID: se puede restaurar en otra cuenta del juego.
    if (consumable && tx.appAccountToken?.toLowerCase() !== userId) throw new InvalidPurchaseError('la compra es de otra cuenta');
    return { transactionId: String(tx.transactionId), productId, quantity: tx.quantity ?? 1, environment, receipt: tx };
  }

  /** ¿Apple confirma que esta transacción fue reembolsada o revocada? (Para los avisos de reembolso.) */
  async isRevoked(transactionId) {
    const found = await this.#lookup(String(transactionId));
    return Boolean(found?.tx.bundleId === this.config.bundleId && found.tx.revocationDate);
  }

  /** En iOS la transacción la cierra la app (finishTransaction) cuando el servidor confirma la entrega. */
  async close() {}
}
