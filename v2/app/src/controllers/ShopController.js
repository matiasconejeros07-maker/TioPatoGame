// Tienda: compras con pesos del juego, equipar, y las compras de power-ups (con pesos o con dinero real).
import { itemOf, SECRET_CHARACTER } from '../../../shared/store.js';
import { POWERUP_COIN_PRICE, PERMANENT, POWERUPS } from '../../../shared/catalog.js';
import { ApiError } from '../services/ApiClient.js';
import { PurchaseOutcome } from './PurchaseController.js';

export class ShopController {
  /**
   * @param {{ api: import('../services/ports.js').Api, wallet: import('../models/WalletModel.js').WalletModel,
   *           inventory: import('../models/InventoryModel.js').InventoryModel, ui: import('../models/UiModel.js').UiModel,
   *           purchases: import('./PurchaseController.js').PurchaseController, audio: import('./AudioController.js').AudioController }} deps
   */
  constructor({ api, wallet, inventory, ui, purchases, audio }) { Object.assign(this, { api, wallet, inventory, ui, purchases, audio }); }

  owns(slot, id) { return itemOf(slot, id)?.price === 0 || this.inventory.owned.includes(`${slot}_${id}`); }
  isEquipped(slot, id) { return this.inventory.equipped[slot] === id; }
  canAfford(price) { return this.wallet.balance >= price; }
  get powerUpCoinPrice() { return POWERUP_COIN_PRICE; }

  /** Compra un artículo con pesos y se lo pone. La animación depende de lo comprado. */
  async buy(slot, id) {
    const item = itemOf(slot, id);
    if (!item || this.owns(slot, id)) return false;
    if (!this.canAfford(item.price)) { this.#toast(`Te faltan $${(item.price - this.wallet.balance).toLocaleString('es-CL')}`, 'warn'); return false; }
    try {
      const result = await this.api.request('POST', '/shop/buy', { slot, itemId: id });
      this.wallet.balance = result.balance;
      this.inventory.owned = result.owned;
      this.inventory.equipped = result.equipped;
      const secret = `${slot}_${id}` === SECRET_CHARACTER;
      this.audio.play(secret ? 'reveal' : 'buy');
      this.ui.celebration = { kind: secret ? 'secret' : 'purchase', slot, item };
      return true;
    } catch (error) { this.#toast(error instanceof ApiError ? 'No se pudo comprar' : 'Sin conexión', 'warn'); return false; }
  }

  async equip(slot, id) {
    if (!this.owns(slot, id) || this.isEquipped(slot, id)) return;
    try { this.inventory.equipped = (await this.api.request('POST', '/shop/equip', { slot, itemId: id })).equipped; this.audio.play('tap'); }
    catch { this.#toast('Sin conexión', 'warn'); }
  }

  /** Un power-up por pesos del juego ($500.000). */
  async buyPowerUpWithCoins(powerupId) {
    if (!this.canAfford(POWERUP_COIN_PRICE)) { this.#toast(`Te faltan $${(POWERUP_COIN_PRICE - this.wallet.balance).toLocaleString('es-CL')}`, 'warn'); return false; }
    const result = await this.purchases.buyWithCoins(powerupId);
    if (!result.ok) { this.#toast(result.reason === 'saldo_insuficiente' ? 'No te alcanzan los pesos' : 'No se pudo comprar', 'warn'); return false; }
    this.wallet.balance = result.balance;
    this.audio.play('buy');
    this.ui.celebration = { kind: 'pack', title: POWERUPS[powerupId].name, grants: { [powerupId]: 1 } };
    return true;
  }

  /** Un pack de power-ups o «Sin anuncios», con dinero real (lo cobra la tienda del teléfono; lo entrega el servidor). */
  async buyWithMoney(offer) {
    const outcome = await this.purchases.buy(offer.productId);
    if (outcome === PurchaseOutcome.DELIVERED) {
      this.audio.play('fanfare');
      this.ui.celebration = Object.hasOwn(PERMANENT, offer.productId) ? { kind: 'noads', title: offer.name } : { kind: 'pack', title: offer.name, grants: offer.grants };
    } else if (outcome === PurchaseOutcome.PENDING) this.#toast('Compra pendiente: se entregará apenas haya conexión', 'warn');
    else if (outcome === PurchaseOutcome.REJECTED) this.#toast('La tienda no confirmó la compra', 'warn');
    return outcome;
  }

  async restorePurchases() { this.#toast((await this.purchases.restore()) ? 'Compras restauradas' : 'No hay compras que restaurar'); }

  /** El jugador deja su WhatsApp en el cuadro VIP del personaje secreto. */
  #toast(text, kind = 'ok') { this.ui.toast = { text, kind }; }
}
