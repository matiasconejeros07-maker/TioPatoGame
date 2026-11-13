// Premios por jugar: racha diaria, logros y objetivos del día. `claimable` alimenta los puntos rojos del menú.
import { Emitter } from '../core/Emitter.js';

export class RewardsModel extends Emitter {
  #streak = { day: 0, claimable: false, reward: 0 };
  #achievements = [];
  #goals = [];

  /** @returns {{ day: number, claimable: boolean, reward: number }} */
  get streak() { return { ...this.#streak }; }
  set streak(value) { this.#streak = { ...value }; this.emit('change', this); }

  /** @returns {{ id: string, label: string, progress: number, goal: number, reward: number, done: boolean, claimed: boolean }[]} */
  get achievements() { return this.#achievements.map((a) => ({ ...a })); }
  set achievements(value) { this.#achievements = value.map((a) => ({ ...a })); this.emit('change', this); }

  get goals() { return this.#goals.map((g) => ({ ...g })); }
  set goals(value) { this.#goals = value.map((g) => ({ ...g })); this.emit('change', this); }
}
