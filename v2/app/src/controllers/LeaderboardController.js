// Marcadores: clásico (sin power-ups de pago) y arcade (con power-ups).
export class LeaderboardController {
  /** @param {{ api: import('../services/ports.js').Api, leaderboard: import('../models/LeaderboardModel.js').LeaderboardModel }} deps */
  constructor({ api, leaderboard }) { this.api = api; this.leaderboard = leaderboard; }

  async refresh() { try { this.leaderboard.boards = await this.api.request('GET', '/leaderboards'); } catch { /* sin conexión */ } }
}
