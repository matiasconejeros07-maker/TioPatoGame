// La sesión del jugador en este teléfono.
import { Emitter } from '../core/Emitter.js';

export class SessionModel extends Emitter {
  #current = null;
  #practice = false;

  /** @returns {{ id: string, key: Uint8Array, userId: string } | null} null = sin sesión */
  get current() { return this.#current; }
  set current(session) { this.#current = session; this.emit('change', this); }

  /** true en la versión web («Modo Práctica»): sin cuenta, sin progreso, sin tienda ni marcadores. */
  get practice() { return this.#practice; }
  set practice(value) { this.#practice = value; }
}
