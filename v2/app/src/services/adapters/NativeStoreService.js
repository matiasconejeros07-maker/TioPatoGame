// Adaptador de compras nativas (@capgo/native-purchases): StoreKit 2 en iOS y Google Play Billing en Android.
// Las compras NO se cierran solas: quedan pendientes hasta que el servidor confirma la entrega.
import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';

const isIos = () => Capacitor.getPlatform() === 'ios';

/** @returns {import('../ports.js').StorePurchase} */
const toPurchase = (tx) => (isIos()
  ? { store: 'apple', productId: tx.productIdentifier, transactionId: tx.transactionId }
  : { store: 'google', productId: tx.productIdentifier, purchaseToken: tx.purchaseToken });

/** @implements {import('../ports.js').StoreService} */
export class NativeStoreService {
  #configured = null;
  #configure() { return (this.#configured ??= NativePurchases.configure({ autoFinishTransactions: false })); }

  async getProducts(productIds) {
    await this.#configure();
    const { products } = await NativePurchases.getProducts({ productIdentifiers: productIds, productType: PURCHASE_TYPE.INAPP });
    return products.map((p) => ({ productId: p.identifier, priceLabel: p.priceString }));
  }

  async purchase(productId, userId) {
    await this.#configure();
    try {
      // appAccountToken ata la compra a la cuenta: el servidor rechaza una compra hecha para otra cuenta.
      const tx = await NativePurchases.purchaseProduct({
        productIdentifier: productId, productType: PURCHASE_TYPE.INAPP, quantity: 1,
        appAccountToken: userId, isConsumable: false, autoAcknowledgePurchases: false,
      });
      return toPurchase(tx);
    } catch (error) {
      if (/cancel/i.test(String(error?.message ?? error))) return null;
      throw error;
    }
  }

  async pendingPurchases() {
    await this.#configure();
    const { transactions } = isIos()
      ? await NativePurchases.getUnfinishedTransactions()
      : { transactions: (await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP })).purchases };
    return transactions.map(toPurchase);
  }

  async finish(purchase) {
    // En Android el servidor ya consumió la compra en Google Play; en iOS hay que sacarla de la cola de StoreKit.
    if (purchase.store === 'apple') await NativePurchases.finishTransaction({ transactionId: purchase.transactionId });
  }
}
