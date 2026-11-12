// Power-ups de pago. Reglas de negocio: se compran solo con dinero real (IAP), se activan cuando el jugador
// quiere, duran exactamente 10 segundos y se pueden usar como mucho 3 por partida.
import { Emitter } from '../core/Emitter.js';
import { POWERUPS, POWERUP_RULES } from '../../../shared/catalog.js';

/** Lo que el jugador tiene guardado. La verdad la tiene el servidor; esto es su reflejo en la app. */
export class PowerUpInventoryModel extends Emitter {
  #quantities = {};
  /** @param {Record<string, number>} quantities  lo que respondió el servidor */
  replace(quantities) { this.#quantities = { ...quantities }; this.emit('change', this.all()); }
  quantity(id) { return this.#quantities[id] ?? 0; }
  all() { return { ...this.#quantities }; }
  take(id) {
    if (this.quantity(id) < 1) throw new Error('No quedan power-ups de ese tipo');
    this.#quantities[id]--;
    this.emit('change', this.all());
  }
}

export const ActivationRefusal = Object.freeze({
  UNKNOWN: 'unknown', NONE_LEFT: 'none_left', MATCH_LIMIT: 'match_limit', ALREADY_ACTIVE: 'already_active',
});

/** Los power-ups de UNA partida. Se crea uno nuevo al empezar cada partida. */
export class MatchPowerUpsModel extends Emitter {
  #inventory;
  #active = new Map();        // id → instante (ms) en que termina
  #used = [];

  /** @param {PowerUpInventoryModel} inventory */
  constructor(inventory, rules = POWERUP_RULES) { super(); this.#inventory = inventory; this.rules = rules; }

  get used() { return [...this.#used]; }
  get remainingThisMatch() { return this.rules.maxPerMatch - this.#used.length; }

  /** @returns {string|null} por qué no se puede activar, o null si se puede */
  refusal(id, now) {
    this.tick(now);
    if (!Object.hasOwn(POWERUPS, id)) return ActivationRefusal.UNKNOWN;
    if (this.#used.length >= this.rules.maxPerMatch) return ActivationRefusal.MATCH_LIMIT;
    if (this.#active.has(id)) return ActivationRefusal.ALREADY_ACTIVE;
    if (this.#inventory.quantity(id) < 1) return ActivationRefusal.NONE_LEFT;
    return null;
  }

  /** Activa un power-up ahora. `now` es el reloj de la partida (se detiene si el juego se pausa). */
  activate(id, now) {
    const refusal = this.refusal(id, now);
    if (refusal) return { ok: false, refusal };
    this.#inventory.take(id);
    const endsAt = now + this.rules.durationMs;
    this.#active.set(id, endsAt);
    this.#used.push(id);
    this.emit('activated', { id, endsAt });
    return { ok: true, endsAt };
  }

  /** Se llama en cada cuadro: apaga los que cumplieron sus 10 segundos. */
  tick(now) {
    for (const [id, endsAt] of this.#active) if (now >= endsAt) { this.#active.delete(id); this.emit('expired', { id }); }
  }

  isActive(id, now) { this.tick(now); return this.#active.has(id); }
  remainingMs(id, now) { return this.isActive(id, now) ? this.#active.get(id) - now : 0; }
}
