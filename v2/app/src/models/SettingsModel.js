// Preferencias de este teléfono.
import { Emitter } from '../core/Emitter.js';

export class SettingsModel extends Emitter {
  #sound = true;
  #music = true;
  get sound() { return this.#sound; }
  set sound(value) { this.#sound = value; this.emit('change', this); }
  get music() { return this.#music; }
  set music(value) { this.#music = value; this.emit('change', this); }
}
