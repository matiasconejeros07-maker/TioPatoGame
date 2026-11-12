// Ajustes → «Cambiar nombre».
import { parseName } from '../../../shared/names.js';
import { ApiError } from '../services/ApiClient.js';

export const RenameOutcome = Object.freeze({ CHANGED: 'changed', INVALID: 'invalid', TAKEN: 'taken', TOO_SOON: 'too_soon', FAILED: 'failed' });

export class ProfileController {
  /** @param {{ api: import('../services/ports.js').Api, profile: import('../models/ProfileModel.js').ProfileModel, now?: () => number }} deps */
  constructor({ api, profile, now = Date.now }) { this.api = api; this.profile = profile; this.now = now; }

  async rename(input) {
    if (!parseName(input)) return RenameOutcome.INVALID;                       // se avisa sin gastar una petición
    if (!this.profile.canChangeName(this.now())) return RenameOutcome.TOO_SOON;
    try {
      this.profile.update(await this.api.request('PUT', '/account/name', { name: input }));
      return RenameOutcome.CHANGED;
    } catch (error) {
      if (!(error instanceof ApiError)) return RenameOutcome.FAILED;
      if (error.status === 429) { this.profile.update({ nextChangeAt: error.details.nextChangeAt }); return RenameOutcome.TOO_SOON; }
      return { 409: RenameOutcome.TAKEN, 422: RenameOutcome.INVALID }[error.status] ?? RenameOutcome.FAILED;
    }
  }
}
