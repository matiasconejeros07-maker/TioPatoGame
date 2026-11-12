// Derechos permanentes de la cuenta («Sin anuncios»). La verdad la tiene el servidor; esto es su reflejo en la app.
import { Emitter } from '../core/Emitter.js';

export class EntitlementsModel extends Emitter {
  #owned = [];

  /** @returns {string[]} p. ej. ['no_ads'] */
  get owned() { return [...this.#owned]; }
  set owned(value) { this.#owned = [...value]; this.emit('change', this.owned); }
}
