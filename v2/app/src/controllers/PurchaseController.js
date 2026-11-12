// Compras con dinero real. El teléfono cobra (StoreKit / Play Billing), pero quien entrega es el servidor,
// después de validar la compra con Apple o Google. La app nunca se suma power-ups por su cuenta.
import { PACKS, PERMANENT, Entitlement } from '../../../shared/catalog.js';
import { ApiError } from '../services/ApiClient.js';

export const PurchaseOutcome = Object.freeze({ DELIVERED: 'delivered', CANCELLED: 'cancelled', PENDING: 'pending', REJECTED: 'rejected' });

export class PurchaseController {
  #busy = false;

  /**
   * @param {{ store: import('../services/ports.js').StoreService, api: import('../services/ports.js').Api,
   *           inventory: import('../models/PowerUpModel.js').PowerUpInventoryModel,
   *           entitlements: import('../models/EntitlementsModel.js').EntitlementsModel, getUserId: () => string }} deps
   */
  constructor({ store, api, inventory, entitlements, getUserId }) {
    this.store = store; this.api = api; this.inventory = inventory; this.entitlements = entitlements; this.getUserId = getUserId;
  }

  /**
   * Lo que se vende, para dibujar la tienda: el catálogo del juego + el precio que informa la tienda (sin precio no se ofrece).
   * `permanent` trae «Sin anuncios» mientras no esté comprado.
   */
  async offers() {
    const products = await this.store.getProducts([...Object.keys(PACKS), ...Object.keys(PERMANENT)]);
    const from = (catalog) => products.filter((p) => Object.hasOwn(catalog, p.productId))
      .map((p) => ({ ...catalog[p.productId], productId: p.productId, priceLabel: p.priceLabel }));
    return { packs: from(PACKS), permanent: from(PERMANENT).filter((o) => !this.entitlements.owned.includes(o.entitlement)) };
  }

  /** Trae del servidor lo que la cuenta tiene comprado (al abrir la app). */
  async sync() { this.#apply(await this.api.request('GET', '/purchases')); }

  /** Ajustes → «Restaurar compras» (lo exige Apple para las compras permanentes). */
  async restore() {
    for (const purchase of await this.store.restorablePurchases()) if (Object.hasOwn(PERMANENT, purchase.productId)) await this.#deliver(purchase);
    return this.entitlements.owned.includes(Entitlement.NO_ADS);
  }

  /** Tienda → un power-up por pesos del juego. @returns {Promise<{ ok: boolean, balance?: number, reason?: string }>} */
  async buyWithCoins(powerupId) {
    try {
      const result = await this.api.request('POST', '/purchases/powerups', { powerupId });
      this.#apply(result);
      return { ok: true, balance: result.balance };
    } catch (error) { return { ok: false, reason: error instanceof ApiError ? error.code : 'sin_conexion' }; }
  }

  /** Lo que respondió el servidor pasa a ser lo que la app muestra. */
  #apply(owned) { this.inventory.quantities = owned.powerups; this.entitlements.owned = owned.entitlements; }

  async buy(productId) {
    if (this.#busy) return PurchaseOutcome.PENDING;          // toque doble en «Comprar»
    this.#busy = true;
    try {
      const purchase = await this.store.purchase(productId, this.getUserId());
      return purchase ? await this.#deliver(purchase) : PurchaseOutcome.CANCELLED;
    } finally { this.#busy = false; }
  }

  /** Al abrir la app: compras pagadas que no alcanzaron a entregarse (se cortó internet, se cerró la app…). */
  async recoverPending() {
    for (const purchase of await this.store.pendingPurchases()) await this.#deliver(purchase);
  }

  async #deliver(purchase) {
    try {
      const result = await this.api.request('POST', '/purchases', purchase);
      this.#apply(result);
      await this.store.finish(purchase).catch(() => {});     // si falla, se cierra en la próxima recuperación
      return PurchaseOutcome.DELIVERED;
    } catch (error) {
      // 422 = la tienda dice que la compra no vale: se cierra para que no quede pegada en la cola.
      if (error instanceof ApiError && error.status === 422) { await this.store.finish(purchase).catch(() => {}); return PurchaseOutcome.REJECTED; }
      return PurchaseOutcome.PENDING;                        // sin conexión o tienda caída: queda pagada y se reintenta sola
    }
  }
}
