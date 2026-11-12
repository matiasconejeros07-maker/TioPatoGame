// En qué pantalla está el juego. Solo guarda el estado; las transiciones válidas las decide GameFlowController.
import { Emitter } from '../core/Emitter.js';

export const GameState = Object.freeze({
  BOOT: 'boot',             // cargando
  CONSENT: 'consent',       // primer inicio: consentimiento de privacidad
  MENU: 'menu',
  PLAYING: 'playing',
  GAME_OVER: 'game_over',   // resumen de la partida
  AD_BREAK: 'ad_break',     // pausa entre partidas (interstitial)
});

export class GameFlowModel extends Emitter {
  #state = GameState.BOOT;
  #mode = null;

  get state() { return this.#state; }
  set state(next) { const previous = this.#state; this.#state = next; this.emit('change', { state: next, previous }); }

  /** Modo de la partida en curso o de la última: `classic` o `arcade`. */
  get mode() { return this.#mode; }
  set mode(mode) { this.#mode = mode; }
}
