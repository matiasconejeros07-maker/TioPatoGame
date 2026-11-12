// Derechos permanentes de la cuenta («Sin anuncios»). La verdad la tiene el servidor; esto es su reflejo en la app.
import { Emitter } from '../core/Emitter.js';
import { Entitlement } from '../../../shared/catalog.js';

export class EntitlementsModel extends Emitter {
  #owned = new Set();
  /** @param {string[]} entitlements  lo que respondió el servidor */
  replace(entitlements) { this.#owned = new Set(entitlements); this.emit('change', [...this.#owned]); }
  has(entitlement) { return this.#owned.has(entitlement); }
  get adFree() { return this.has(Entitlement.NO_ADS); }
}
