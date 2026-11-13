// Lo comprado con pesos del juego y lo que el jugador lleva puesto.
import { Emitter } from '../core/Emitter.js';

export class InventoryModel extends Emitter {
  #owned = [];
  #equipped = {};

  /** @returns {string[]} ids como en la V1: 'ch_tia', 'ball_oro', 'pad_neon', 'bg_aurora', 'sfx_cuac' */
  get owned() { return [...this.#owned]; }
  set owned(value) { this.#owned = [...value]; this.emit('change', this); }

  /** @returns {Record<string, string>} ranura → id: { ch, ball, pad, bg, sfx } */
  get equipped() { return { ...this.#equipped }; }
  set equipped(value) { this.#equipped = { ...value }; this.emit('change', this); }
}
