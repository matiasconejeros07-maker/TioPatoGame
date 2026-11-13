// Al terminar una partida: la informa al servidor (que calcula los pesos) y actualiza saldo, récords y premios.
export class ResultsController {
  /**
   * @param {{ api: import('../services/ports.js').Api, powerUps: { serverMatchId: Promise<string|null> }, wallet: import('../models/WalletModel.js').WalletModel,
   *           leaderboard: import('../models/LeaderboardModel.js').LeaderboardModel, result: import('../models/ResultModel.js').ResultModel,
   *           rewards: { refresh(): Promise<unknown> } }} deps
   */
  constructor({ api, powerUps, wallet, leaderboard, result, rewards }) { Object.assign(this, { api, powerUps, wallet, leaderboard, result, rewards }); }

  async finish(match) {
    const summary = { hits: match.hits, mode: match.mode, seconds: Math.round(match.durationMs / 1000) };
    // Mientras responde el servidor se muestra lo que contó la app; los pesos que valen son los que diga el servidor.
    this.result.last = { ...summary, earned: match.earned, isRecord: false, best: this.leaderboard.best[match.mode] ?? 0, saved: false };
    try {
      const matchId = await this.powerUps.serverMatchId;
      if (!matchId) return;                                   // sin conexión: la partida no suma pesos ni marcador
      const outcome = await this.api.request('POST', `/matches/${matchId}/finish`, { hits: match.hits, durationMs: Math.round(match.durationMs) });
      this.wallet.balance = outcome.balance;
      this.leaderboard.best = outcome.best;
      this.result.last = { ...summary, earned: outcome.earned, isRecord: outcome.isRecord, best: outcome.best[match.mode], saved: true };
      await this.rewards.refresh();
    } catch { /* queda como «no guardada» */ }
  }
}
