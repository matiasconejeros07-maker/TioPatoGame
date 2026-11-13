// Power-ups de pago dentro de la partida. Reglas de negocio: se activan cuando el jugador quiere, duran
// exactamente 10 segundos, máximo 3 por partida, y solo en modo arcade (en el ranking clásico están desactivados).
// El efecto empieza al instante (no se espera a la red) y, en paralelo, el servidor lo descuenta del inventario;
// si el servidor no lo acepta, el efecto se apaga y el power-up vuelve.
import { MatchPowerUpsModel } from '../models/PowerUpModel.js';
import { MatchMode, POWERUPS, POWERUP_RULES } from '../../../shared/catalog.js';

export const ActivationRefusal = Object.freeze({
  NO_MATCH: 'no_match', CLASSIC_MODE: 'classic_mode', UNKNOWN: 'unknown', NONE_LEFT: 'none_left',
  MATCH_LIMIT: 'match_limit', ALREADY_ACTIVE: 'already_active',
});

export class PowerUpController {
  /** @type {MatchPowerUpsModel|null} los power-ups de la partida en curso (la Vista se suscribe a sus avisos) */
  match = null;
  #matchId = null;

  /** @param {{ api: import('../services/ports.js').Api, inventory: import('../models/PowerUpModel.js').PowerUpInventoryModel, rules?: typeof POWERUP_RULES }} deps */
  constructor({ api, inventory, rules = POWERUP_RULES }) { this.api = api; this.inventory = inventory; this.rules = rules; }

  /** Al empezar cada partida. @returns {Promise<MatchPowerUpsModel>} */
  beginMatch(mode) {
    const match = this.match = new MatchPowerUpsModel(mode);
    this.#matchId = this.api.request('POST', '/matches', { mode }).then((r) => r.matchId, () => null);   // sin conexión: partida sin power-ups de pago
    return this.#matchId.then(() => match);
  }

  /** Id de la partida en el servidor (null si no se pudo crear: sin conexión). */
  get serverMatchId() { return this.#matchId ?? Promise.resolve(null); }

  get remainingThisMatch() { return this.match ? this.rules.maxPerMatch - this.match.used.length : 0; }
  isActive(id, now) { this.tick(now); return this.match ? id in this.match.active : false; }
  remainingMs(id, now) { return this.isActive(id, now) ? this.match.active[id] - now : 0; }

  /** @returns {string|null} por qué no se puede activar, o null si se puede */
  refusal(id, now) {
    const match = this.match;
    if (!match) return ActivationRefusal.NO_MATCH;
    this.tick(now);
    if (match.mode !== MatchMode.ARCADE) return ActivationRefusal.CLASSIC_MODE;
    if (!Object.hasOwn(POWERUPS, id)) return ActivationRefusal.UNKNOWN;
    if (match.used.length >= this.rules.maxPerMatch) return ActivationRefusal.MATCH_LIMIT;
    if (id in match.active) return ActivationRefusal.ALREADY_ACTIVE;
    if ((this.inventory.quantities[id] ?? 0) < 1) return ActivationRefusal.NONE_LEFT;
    return null;
  }

  /** El jugador toca un power-up. `now` es el reloj de la partida (se detiene si el juego se pausa). */
  activate(id, now) {
    const refusal = this.refusal(id, now);
    if (refusal) return { ok: false, refusal };
    const match = this.match;
    const endsAt = now + this.rules.durationMs;
    this.#addToInventory(id, -1);
    match.active = { ...match.active, [id]: endsAt };
    match.used = [...match.used, id];
    match.emit('activated', { id, endsAt });
    this.#spendOnServer(match, id);
    return { ok: true, endsAt };
  }

  /** Se llama en cada cuadro: apaga los que cumplieron sus 10 segundos. */
  tick(now) {
    const match = this.match;
    if (!match) return;
    const expired = Object.entries(match.active).filter(([, endsAt]) => now >= endsAt).map(([id]) => id);
    if (!expired.length) return;
    match.active = Object.fromEntries(Object.entries(match.active).filter(([id]) => !expired.includes(id)));
    for (const id of expired) match.emit('expired', { id });
  }

  #addToInventory(id, delta) {
    const quantities = this.inventory.quantities;
    this.inventory.quantities = { ...quantities, [id]: (quantities[id] ?? 0) + delta };
  }

  async #spendOnServer(match, id) {
    try {
      const matchId = await this.#matchId;
      if (!matchId) throw new Error('sin partida en el servidor');
      const { remaining } = await this.api.request('POST', `/matches/${matchId}/powerups`, { powerupId: id });
      this.inventory.quantities = { ...this.inventory.quantities, [id]: remaining };       // la cantidad que dice el servidor
    } catch { this.#cancel(match, id); }
  }

  /** El servidor no aceptó el uso (sin conexión, sin saldo…): se apaga el efecto y se devuelve al inventario. */
  #cancel(match, id) {
    if (!(id in match.active)) return;
    const { [id]: _, ...rest } = match.active;
    const used = match.used;
    used.splice(used.lastIndexOf(id), 1);
    match.active = rest;
    match.used = used;
    this.#addToInventory(id, 1);
    match.emit('expired', { id, cancelled: true });
  }
}
