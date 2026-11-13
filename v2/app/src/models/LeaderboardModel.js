// Marcadores: uno por modo (clásico = sin power-ups de pago · arcade = con power-ups).
import { Emitter } from '../core/Emitter.js';

export class LeaderboardModel extends Emitter {
  #boards = { classic: null, arcade: null };
  #best = { classic: 0, arcade: 0 };

  /** @returns {Record<string, { top: { name: string, score: number, me?: boolean }[], myRank: number|null } | null>} */
  get boards() { return { ...this.#boards }; }
  set boards(value) { this.#boards = { ...value }; this.emit('change', this); }

  /** Mi mejor partida en cada modo. */
  get best() { return { ...this.#best }; }
  set best(value) { this.#best = { ...value }; this.emit('change', this); }
}
