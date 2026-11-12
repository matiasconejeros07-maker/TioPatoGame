// Controlador de estados del juego: coordina el arranque (consentimiento), las partidas y la pausa de anuncios.
import { GameState } from '../models/GameFlowModel.js';

export class GameFlowController {
  /**
   * @param {{ flow: import('../models/GameFlowModel.js').GameFlowModel, ads: import('./AdsController.js').AdsController,
   *           purchases: { sync(): Promise<unknown>, recoverPending(): Promise<unknown> } }} deps
   */
  constructor({ flow, ads, purchases }) { this.flow = flow; this.ads = ads; this.purchases = purchases; }

  /** Arranque de la app: ¿compró «Sin anuncios»? → si no, consentimiento y anuncios → compras pendientes → menú. */
  async boot() {
    this.flow.go(GameState.CONSENT);
    await this.purchases.sync().catch(() => {});           // sin conexión se asume que no: verá anuncios hasta que se sepa
    await this.ads.start();
    this.purchases.recoverPending().catch(() => {});       // en segundo plano: no retrasa el menú
    this.flow.go(GameState.MENU);
  }

  startMatch() {
    this.flow.go(GameState.PLAYING);
    this.ads.preload();
  }

  endMatch() { this.flow.go(GameState.GAME_OVER); }

  /** El jugador sale del resumen de la partida (a `MENU` o a jugar de nuevo): aquí, y solo aquí, puede ir un anuncio. */
  async leaveGameOver(next = GameState.MENU) {
    if (this.flow.state !== GameState.GAME_OVER) return;     // toque doble: ya se está saliendo
    this.flow.go(GameState.AD_BREAK);
    await this.ads.breakAfterMatch();
    if (next === GameState.PLAYING) this.startMatch(); else this.flow.go(GameState.MENU);
  }
}
