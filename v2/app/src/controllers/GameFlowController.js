// Controlador de estados del juego: decide por dónde se puede pasar de una pantalla a otra y coordina el
// arranque, las partidas y la pausa de anuncios.
import { GameState } from '../models/GameFlowModel.js';
import { MatchMode } from '../../../shared/catalog.js';

// Transiciones permitidas. No existe PLAYING → AD_BREAK: un anuncio encima de una partida es imposible.
const TRANSITIONS = Object.freeze({
  [GameState.BOOT]: [GameState.CONSENT, GameState.MENU],
  [GameState.CONSENT]: [GameState.MENU],
  [GameState.MENU]: [GameState.PLAYING],
  [GameState.PLAYING]: [GameState.GAME_OVER],
  [GameState.GAME_OVER]: [GameState.AD_BREAK],
  [GameState.AD_BREAK]: [GameState.MENU, GameState.PLAYING],
});

export class GameFlowController {
  /**
   * @param {{ flow: import('../models/GameFlowModel.js').GameFlowModel, ads: import('./AdsController.js').AdsController,
   *           purchases: { sync(): Promise<unknown>, recoverPending(): Promise<unknown> },
   *           powerUps: { beginMatch(mode: string): Promise<unknown> }, match?: { begin(mode: string): void } }} deps
   */
  constructor({ flow, ads, purchases, powerUps, match }) { this.flow = flow; this.ads = ads; this.purchases = purchases; this.powerUps = powerUps; this.match = match; }

  canGo(next) { return TRANSITIONS[this.flow.state].includes(next); }

  #go(next) {
    if (!this.canGo(next)) throw new Error(`Transición no permitida: ${this.flow.state} → ${next}`);
    this.flow.state = next;
  }

  /** Arranque de la app: ¿compró «Sin anuncios»? → si no, consentimiento y anuncios → compras pendientes → menú. */
  async boot() {
    this.#go(GameState.CONSENT);
    await this.purchases.sync().catch(() => {});           // sin conexión se asume que no: verá anuncios hasta que se sepa
    await this.ads.start();
    this.purchases.recoverPending().catch(() => {});       // en segundo plano: no retrasa el menú
    this.#go(GameState.MENU);
  }

  /** @param {string} mode  `classic` (ranking principal, sin power-ups de pago) o `arcade` */
  startMatch(mode = MatchMode.CLASSIC) {
    this.#go(GameState.PLAYING);
    this.flow.mode = mode;
    this.powerUps.beginMatch(mode);
    this.match?.begin(mode);
    this.ads.preload();
  }

  endMatch() { this.#go(GameState.GAME_OVER); }

  /** El jugador sale del resumen de la partida (a `MENU` o a jugar de nuevo): aquí, y solo aquí, puede ir un anuncio. */
  async leaveGameOver(next = GameState.MENU) {
    if (this.flow.state !== GameState.GAME_OVER) return;     // toque doble, o todavía se está jugando
    this.#go(GameState.AD_BREAK);
    await this.ads.breakAfterMatch();
    if (next === GameState.PLAYING) this.startMatch(this.flow.mode); else this.#go(GameState.MENU);
  }
}
