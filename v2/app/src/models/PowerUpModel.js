// Power-ups de pago: lo que el jugador tiene guardado y lo que pasa con ellos en la partida en curso.
// Solo datos; las reglas (10 s, máximo 3 por partida, solo en arcade) las aplica PowerUpController.
import { Emitter } from '../core/Emitter.js';

/** Inventario. La verdad la tiene el servidor; esto es su reflejo en la app. */
export class PowerUpInventoryModel extends Emitter {
  #quantities = {};

  /** @returns {Record<string, number>} cantidad por tipo de power-up */
  get quantities() { return { ...this.#quantities }; }
  set quantities(value) { this.#quantities = { ...value }; this.emit('change', this.quantities); }
}

/** Los power-ups de UNA partida. Se crea uno nuevo al empezar cada partida. */
export class MatchPowerUpsModel extends Emitter {
  #mode;
  #active = {};       // id → instante (ms del reloj de la partida) en que termina
  #used = [];         // ids usados en esta partida, en orden

  constructor(mode) { super(); this.#mode = mode; }

  get mode() { return this.#mode; }

  /** @returns {Record<string, number>} power-ups encendidos y cuándo se apaga cada uno */
  get active() { return { ...this.#active }; }
  set active(value) { this.#active = { ...value }; this.emit('change', this); }

  /** @returns {string[]} */
  get used() { return [...this.#used]; }
  set used(value) { this.#used = [...value]; this.emit('change', this); }
}
