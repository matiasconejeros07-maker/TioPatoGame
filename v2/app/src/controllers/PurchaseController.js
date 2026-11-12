// Compras con dinero real. El teléfono cobra (StoreKit / Play Billing), pero quien entrega es el servidor,
// después de validar la compra con Apple o Google. La app nunca se suma power-ups por su cuenta.
import { PACKS } from '../../../shared/catalog.js';
import { ApiError } from '../services/ApiClient.js';

export const PurchaseOutcome = Object.freeze({ DELIVERED: 'delivered', CANCELLED: 'cancelled', PENDING: 'pending', REJECTED: 'rejected' });

export class PurchaseController {
  #busy = false;

  /**
   * @param {{ store: import('../services/ports.js').StoreService, api: import('../services/ports.js').Api,
   *           inventory: import('../models/PowerUpModel.js').PowerUpInventoryModel, getUserId: () => string }} deps
   */
  constructor({ store, api, inventory, getUserId }) { this.store = store; this.api = api; this.inventory = inventory; this.getUserId = getUserId; }

  /** Packs para dibujar la tienda: el catálogo del juego + el precio que informa la tienda. Sin precio no se ofrece. */
  async offers() {
    const products = await this.store.getProducts(Object.keys(PACKS));
    return products.filter((p) => Object.hasOwn(PACKS, p.productId)).map((p) => ({ ...PACKS[p.productId], productId: p.productId, priceLabel: p.priceLabel }));
  }

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
      this.inventory.replace(result.powerups);
      await this.store.finish(purchase).catch(() => {});     // si falla, se cierra en la próxima recuperación
      return PurchaseOutcome.DELIVERED;
    } catch (error) {
      // 422 = la tienda dice que la compra no vale: se cierra para que no quede pegada en la cola.
      if (error instanceof ApiError && error.status === 422) { await this.store.finish(purchase).catch(() => {}); return PurchaseOutcome.REJECTED; }
      return PurchaseOutcome.PENDING;                        // sin conexión o tienda caída: queda pagada y se reintenta sola
    }
  }
}
