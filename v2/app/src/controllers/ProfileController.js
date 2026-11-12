// Ajustes → «Cambiar nombre».
import { checkName, NameProblem } from '../../../shared/names.js';
import { ApiError } from '../services/ApiClient.js';

export const RenameOutcome = Object.freeze({ CHANGED: 'changed', INVALID: 'invalid', OFFENSIVE: 'offensive', TAKEN: 'taken', TOO_SOON: 'too_soon', FAILED: 'failed' });

export class ProfileController {
  /** @param {{ api: import('../services/ports.js').Api, profile: import('../models/ProfileModel.js').ProfileModel, now?: () => number }} deps */
  constructor({ api, profile, now = Date.now }) { this.api = api; this.profile = profile; this.now = now; }

  /** ¿Ya pasaron los 30 días desde el último cambio? (El servidor lo vuelve a comprobar.) */
  get canChangeName() { const next = this.profile.nextNameChangeAt; return !next || this.now() >= next.getTime(); }
  /** Para mostrar «faltan N días». */
  get daysUntilNameChange() { return this.canChangeName ? 0 : Math.ceil((this.profile.nextNameChangeAt.getTime() - this.now()) / 86_400_000); }

  async rename(input) {
    const problem = checkName(input).problem;                                  // se avisa sin gastar una petición
    if (problem) return problem === NameProblem.OFFENSIVE ? RenameOutcome.OFFENSIVE : RenameOutcome.INVALID;
    if (!this.canChangeName) return RenameOutcome.TOO_SOON;
    try {
      const result = await this.api.request('PUT', '/account/name', { name: input });
      this.profile.displayName = result.displayName;
      this.profile.nextNameChangeAt = new Date(result.nextChangeAt);
      return RenameOutcome.CHANGED;
    } catch (error) {
      if (!(error instanceof ApiError)) return RenameOutcome.FAILED;
      if (error.status === 429) { this.profile.nextNameChangeAt = new Date(error.details.nextChangeAt); return RenameOutcome.TOO_SOON; }
      if (error.code === NameProblem.OFFENSIVE) return RenameOutcome.OFFENSIVE;
      return { 409: RenameOutcome.TAKEN, 422: RenameOutcome.INVALID }[error.status] ?? RenameOutcome.FAILED;
    }
  }

  /** Cuadro VIP del personaje secreto: deja el WhatsApp (formato +56912345678). @returns {Promise<boolean>} si quedó guardado */
  async saveVipContact(whatsapp, consent) {
    try { await this.api.request('PUT', '/account/vip', { whatsapp, consent }); return true; } catch { return false; }
  }
}
