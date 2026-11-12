// Estados del juego y por dónde se puede pasar de uno a otro. Es la única fuente de verdad de «en qué pantalla estamos»:
// por eso un anuncio solo puede existir en AD_BREAK y nunca encima de una partida.
import { Emitter } from '../core/Emitter.js';

export const GameState = Object.freeze({
  BOOT: 'boot',             // cargando
  CONSENT: 'consent',       // primer inicio: consentimiento de privacidad
  MENU: 'menu',
  PLAYING: 'playing',
  GAME_OVER: 'game_over',   // resumen de la partida
  AD_BREAK: 'ad_break',     // pausa entre partidas (interstitial)
});

const TRANSITIONS = Object.freeze({
  [GameState.BOOT]: [GameState.CONSENT, GameState.MENU],
  [GameState.CONSENT]: [GameState.MENU],
  [GameState.MENU]: [GameState.PLAYING],
  [GameState.PLAYING]: [GameState.GAME_OVER],
  [GameState.GAME_OVER]: [GameState.AD_BREAK, GameState.MENU, GameState.PLAYING],
  [GameState.AD_BREAK]: [GameState.MENU, GameState.PLAYING],
});

export class GameFlowModel extends Emitter {
  #state = GameState.BOOT;
  get state() { return this.#state; }
  canGo(next) { return TRANSITIONS[this.#state].includes(next); }
  go(next) {
    if (!this.canGo(next)) throw new Error(`Transición no permitida: ${this.#state} → ${next}`);
    const previous = this.#state;
    this.#state = next;
    this.emit('change', { state: next, previous });
  }
}
