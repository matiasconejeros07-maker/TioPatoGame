// Nombre del jugador y desde cuándo puede volver a cambiarlo (lo decide el servidor).
import { Emitter } from '../core/Emitter.js';

export class ProfileModel extends Emitter {
  #displayName = '';
  #nextNameChangeAt = null;

  get displayName() { return this.#displayName; }
  set displayName(value) { this.#displayName = value; this.emit('change', this); }

  /** @returns {Date|null} null = puede cambiarlo ya */
  get nextNameChangeAt() { return this.#nextNameChangeAt; }
  set nextNameChangeAt(value) { this.#nextNameChangeAt = value; this.emit('change', this); }
}
