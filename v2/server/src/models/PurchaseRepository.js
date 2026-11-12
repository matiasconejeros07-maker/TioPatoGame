// Entrega de compras con dinero real. La regla de oro: una transacción de la tienda se entrega una sola vez,
// y la compra, el inventario y el libro de movimientos se escriben juntos o no se escribe nada.
export class PurchaseRepository {
  /** @param {import('postgres').Sql} sql */
  constructor(sql) { this.sql = sql; }

  /**
   * @param {{ userId: string, store: 'apple'|'google', verified: object, grants: Record<string, number> }} input
   * @returns {Promise<{ granted: boolean, ownerId: string|null, storeClosed: boolean }>} granted=false si ya se había entregado
   */
  grant({ userId, store, verified, grants }) {
    return this.sql.begin(async (tx) => {
      const [created] = await tx`
        INSERT INTO purchases (user_id, store, product_id, transaction_id, environment, purchase_token, receipt)
        VALUES (${userId}, ${store}, ${verified.productId}, ${verified.transactionId}, ${verified.environment},
                ${verified.purchaseToken ?? null}, ${tx.json(verified.receipt)})
        ON CONFLICT (store, transaction_id) DO NOTHING
        RETURNING id`;
      if (!created) {
        const [existing] = await tx`SELECT user_id, store_closed FROM purchases WHERE store = ${store} AND transaction_id = ${verified.transactionId}`;
        return { granted: false, ownerId: existing.user_id, storeClosed: existing.store_closed };
      }
      for (const [powerupId, perPack] of Object.entries(grants)) {
        const quantity = perPack * verified.quantity;
        await tx`
          INSERT INTO powerup_inventory (user_id, powerup_id, quantity) VALUES (${userId}, ${powerupId}, ${quantity})
          ON CONFLICT (user_id, powerup_id) DO UPDATE SET quantity = powerup_inventory.quantity + EXCLUDED.quantity`;
        await tx`
          INSERT INTO powerup_ledger (user_id, powerup_id, delta, reason, ref) VALUES (${userId}, ${powerupId}, ${quantity}, 'purchase', ${created.id})`;
      }
      return { granted: true, ownerId: userId, storeClosed: false };
    });
  }

  async markStoreClosed(store, transactionId) {
    await this.sql`UPDATE purchases SET store_closed = true WHERE store = ${store} AND transaction_id = ${transactionId}`;
  }

  /** @returns {Promise<Record<string, number>>} */
  async powerups(userId) {
    const rows = await this.sql`SELECT powerup_id, quantity FROM powerup_inventory WHERE user_id = ${userId}`;
    return Object.fromEntries(rows.map((r) => [r.powerup_id, r.quantity]));
  }
}
