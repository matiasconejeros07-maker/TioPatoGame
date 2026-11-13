// Racha diaria, logros y objetivos del día. También responde qué menús llevan punto rojo.
export class RewardsController {
  /**
   * @param {{ api: import('../services/ports.js').Api, rewards: import('../models/RewardsModel.js').RewardsModel,
   *           wallet: import('../models/WalletModel.js').WalletModel, ui: import('../models/UiModel.js').UiModel,
   *           audio: import('./AudioController.js').AudioController }} deps
   */
  constructor({ api, rewards, wallet, ui, audio }) { Object.assign(this, { api, rewards, wallet, ui, audio }); }

  async refresh() { try { this.#apply(await this.api.request('GET', '/rewards')); } catch { /* sin conexión: se queda lo último */ } }

  #apply(data) { this.rewards.streak = data.streak; this.rewards.achievements = data.achievements; this.rewards.goals = data.goals; }

  /** Puntos rojos: hay algo por cobrar en ese menú. */
  get badges() {
    const claimable = (list) => list.some((item) => item.done && !item.claimed);
    return { streak: this.rewards.streak.claimable, achievements: claimable(this.rewards.achievements), goals: claimable(this.rewards.goals) };
  }

  /** @param {'streak'|'achievement'|'goal'} kind */
  async claim(kind, id) {
    try {
      const result = await this.api.request('POST', '/rewards/claim', { kind, id });
      this.wallet.balance = result.balance;
      this.#apply(result);
      this.audio.play('coin');
      this.ui.celebration = { kind: 'coins', amount: result.reward };
      return true;
    } catch { this.ui.toast = { text: 'No se pudo cobrar', kind: 'warn' }; return false; }
  }
}
