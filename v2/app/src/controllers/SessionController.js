// Carga lo del jugador al entrar (perfil, saldo, inventario, récords) y lo limpia al salir.
import { DEFAULT_EQUIPPED } from '../../../shared/store.js';

export class SessionController {
  /**
   * @param {{ api: import('../services/ports.js').Api, auth: import('./AuthController.js').AuthController, models: object,
   *           rewards: { refresh(): Promise<unknown> }, ui: import('../models/UiModel.js').UiModel }} deps
   */
  constructor({ api, auth, models, rewards, ui }) { Object.assign(this, { api, auth, models, rewards, ui }); }

  /** Sesión guardada o inicio de sesión nuevo, y después los datos del jugador. @returns {Promise<boolean>} si quedó dentro */
  async enter() {
    if (await this.auth.restore()) {
      try { await this.load(); return true; } catch { /* la sesión guardada ya no vale: se inicia de nuevo */ }
    }
    if ((await this.auth.signIn()).outcome !== 'signed_in') return false;
    await this.load();
    return true;
  }

  async load() {
    const me = await this.api.request('GET', '/me');
    const { profile, wallet, inventory, leaderboard, powerUps, entitlements } = this.models;
    profile.displayName = me.profile.displayName;
    profile.nextNameChangeAt = me.profile.nextNameChangeAt ? new Date(me.profile.nextNameChangeAt) : null;
    wallet.balance = me.wallet.balance;
    inventory.owned = me.inventory.owned;
    inventory.equipped = { ...DEFAULT_EQUIPPED, ...me.inventory.equipped };
    leaderboard.best = me.best;
    powerUps.quantities = me.powerups;
    entitlements.owned = me.entitlements;
    await this.rewards.refresh();
  }

  /** Ajustes → «Eliminar cuenta» (ya confirmado en la vista). Empieza de cero con una cuenta nueva. */
  async deleteAccount() {
    if (!(await this.auth.deleteAccount())) { this.ui.toast = { text: 'No se pudo eliminar la cuenta', kind: 'warn' }; return false; }
    this.ui.panel = null;
    await this.enter();
    this.ui.toast = { text: 'Cuenta eliminada', kind: 'ok' };
    return true;
  }
}
