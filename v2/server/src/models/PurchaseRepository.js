// Entrega de compras con dinero real. La regla de oro: una transacción de la tienda se entrega una sola vez,
// y la compra, lo entregado y el libro de movimientos se escriben juntos o no se escribe nada.
export class PurchaseRepository {
  /** @param {import('postgres').Sql} sql */
  constructor(sql) { this.sql = sql; }

  /**
   * @param {{ userId: string, store: 'apple'|'google', verified: object,
   *           product: { consumable: true, grants: Record<string, number> } | { consumable: false, entitlement: string } }} input
   * @returns {Promise<{ granted: boolean, ownerId: string|null, storeClosed: boolean }>} granted=false si ya se había entregado a esta cuenta
   */
  grant({ userId, store, verified, product }) {
    return this.sql.begin(async (tx) => {
      const [created] = await tx`
        INSERT INTO purchases (user_id, store, product_id, transaction_id, environment, purchase_token, receipt)
        VALUES (${userId}, ${store}, ${verified.productId}, ${verified.transactionId}, ${verified.environment},
                ${verified.purchaseToken ?? null}, ${tx.json(verified.receipt)})
        ON CONFLICT (store, transaction_id) DO NOTHING
        RETURNING id`;
      const [purchase] = created ? [{ id: created.id, user_id: userId, store_closed: false }]
        : await tx`SELECT id, user_id, store_closed FROM purchases WHERE store = ${store} AND transaction_id = ${verified.transactionId} FOR UPDATE`;

      if (product.consumable) {
        if (!created) return { granted: false, ownerId: purchase.user_id, storeClosed: purchase.store_closed };
        for (const [powerupId, perPack] of Object.entries(product.grants)) {
          const quantity = perPack * verified.quantity;
          await tx`
            INSERT INTO powerup_inventory (user_id, powerup_id, quantity) VALUES (${userId}, ${powerupId}, ${quantity})
            ON CONFLICT (user_id, powerup_id) DO UPDATE SET quantity = powerup_inventory.quantity + EXCLUDED.quantity`;
          await tx`
            INSERT INTO powerup_ledger (user_id, powerup_id, delta, reason, ref) VALUES (${userId}, ${powerupId}, ${quantity}, 'purchase', ${purchase.id})`;
        }
        return { granted: true, ownerId: userId, storeClosed: false };
      }

      // Compra permanente: vale para UNA cuenta a la vez. «Restaurar compras» desde otra cuenta la mueve
      // (por ejemplo, tras eliminar la cuenta y empezar de nuevo con el mismo Apple ID / cuenta de Google).
      const moved = purchase.user_id !== userId;
      if (moved) {
        await tx`DELETE FROM entitlements WHERE purchase_id = ${purchase.id}`;
        await tx`UPDATE purchases SET user_id = ${userId} WHERE id = ${purchase.id}`;
      }
      await tx`
        INSERT INTO entitlements (user_id, entitlement_id, purchase_id) VALUES (${userId}, ${product.entitlement}, ${purchase.id})
        ON CONFLICT (user_id, entitlement_id) DO NOTHING`;
      return { granted: Boolean(created) || moved, ownerId: userId, storeClosed: purchase.store_closed };
    });
  }

  async markStoreClosed(store, transactionId) {
    await this.sql`UPDATE purchases SET store_closed = true WHERE store = ${store} AND transaction_id = ${transactionId}`;
  }

  /** Lo que la cuenta tiene comprado con dinero real. @returns {Promise<{ powerups: Record<string, number>, entitlements: string[] }>} */
  async owned(userId) {
    const powerups = await this.sql`SELECT powerup_id, quantity FROM powerup_inventory WHERE user_id = ${userId}`;
    const entitlements = await this.sql`SELECT entitlement_id FROM entitlements WHERE user_id = ${userId} ORDER BY 1`;
    return { powerups: Object.fromEntries(powerups.map((r) => [r.powerup_id, r.quantity])), entitlements: entitlements.map((r) => r.entitlement_id) };
  }
}
