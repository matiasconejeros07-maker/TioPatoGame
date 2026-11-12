// Caso de uso «validar y entregar una compra». Orden: (1) el producto existe · (2) la tienda confirma la
// compra · (3) se entrega en una transacción, una sola vez · (4) se cierra la compra en la tienda.
import { productOf } from '../../../shared/catalog.js';
import { HttpError, InvalidPurchaseError } from './errors.js';

export class PurchaseService {
  /**
   * @param {{ purchases: import('../models/PurchaseRepository.js').PurchaseRepository,
   *           verifiers: Record<'apple'|'google', { verify(input: object): Promise<object>, close(verified: object): Promise<void> }> }} deps
   */
  constructor({ purchases, verifiers }) { this.purchases = purchases; this.verifiers = verifiers; }

  owned(userId) { return this.purchases.owned(userId); }

  async redeem(userId, { store, productId, transactionId, purchaseToken }) {
    const product = productOf(productId);
    const verifier = Object.hasOwn(this.verifiers, store ?? '') ? this.verifiers[store] : null;
    if (!product || !verifier) throw new InvalidPurchaseError('producto o tienda desconocidos');

    const verified = await verifier.verify({ productId, transactionId, purchaseToken, userId, consumable: product.consumable });
    const result = await this.purchases.grant({ userId, store, verified, product });
    if (result.ownerId !== userId) throw new HttpError(409, 'compra_de_otra_cuenta');

    // Si falla el cierre en la tienda no se pierde nada: la app reenvía la compra pendiente al abrir
    // y aquí se vuelve a intentar (la entrega no se repite).
    if (!result.storeClosed) {
      await verifier.close(verified);
      await this.purchases.markStoreClosed(store, verified.transactionId);
    }
    return { granted: result.granted, ...(await this.purchases.owned(userId)) };
  }
}
