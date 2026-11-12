// Controlador de estados del juego: coordina el arranque (consentimiento), las partidas y la pausa de anuncios.
import { GameState } from '../models/GameFlowModel.js';

export class GameFlowController {
  #matchStartedAt = 0;

  /**
   * @param {{ flow: import('../models/GameFlowModel.js').GameFlowModel, consent: import('./ConsentController.js').ConsentController,
   *           ads: import('./AdsController.js').AdsController, purchases?: { recoverPending(): Promise<unknown> }, now?: () => number }} deps
   */
  constructor({ flow, consent, ads, purchases, now = Date.now }) {
    this.flow = flow; this.consent = consent; this.ads = ads; this.purchases = purchases; this.now = now;
  }

  /** Arranque de la app: consentimiento → anuncios (si se puede) → compras pendientes → menú. */
  async boot() {
    this.flow.go(GameState.CONSENT);
    if (await this.consent.resolve()) await this.ads.enable();
    this.purchases?.recoverPending().catch(() => {});      // en segundo plano: no retrasa el menú
    this.flow.go(GameState.MENU);
  }

  startMatch() {
    this.flow.go(GameState.PLAYING);
    this.#matchStartedAt = this.now();
    this.ads.preload();
  }

  endMatch() { this.flow.go(GameState.GAME_OVER); }

  /** El jugador sale del resumen de la partida (a `MENU` o a jugar de nuevo): aquí, y solo aquí, puede ir un anuncio. */
  async leaveGameOver(next = GameState.MENU) {
    if (this.flow.state !== GameState.GAME_OVER) return;     // toque doble: ya se está saliendo
    const lastMatchMs = this.now() - this.#matchStartedAt;
    this.flow.go(GameState.AD_BREAK);
    await this.ads.breakAfterMatch(lastMatchMs);
    if (next === GameState.PLAYING) this.startMatch(); else this.flow.go(GameState.MENU);
  }
}
