// Nombre del jugador y cuándo puede volver a cambiarlo (una vez cada 30 días; lo decide el servidor).
import { Emitter } from '../core/Emitter.js';

export class ProfileModel extends Emitter {
  displayName = '';
  /** @type {Date|null} null = puede cambiarlo ya */
  nextNameChangeAt = null;

  update({ displayName, nextChangeAt }) {
    if (displayName !== undefined) this.displayName = displayName;
    if (nextChangeAt !== undefined) this.nextNameChangeAt = nextChangeAt ? new Date(nextChangeAt) : null;
    this.emit('change', this);
  }
  canChangeName(now = Date.now()) { return !this.nextNameChangeAt || now >= this.nextNameChangeAt.getTime(); }
  daysUntilNameChange(now = Date.now()) { return this.canChangeName(now) ? 0 : Math.ceil((this.nextNameChangeAt.getTime() - now) / 86_400_000); }
}
