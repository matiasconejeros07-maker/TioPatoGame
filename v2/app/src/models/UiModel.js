// Qué panel está abierto encima del menú y qué avisos hay en pantalla.
import { Emitter } from '../core/Emitter.js';

export class UiModel extends Emitter {
  #panel = null;
  #panelTab = null;
  #toast = null;
  #celebration = null;

  /** 'shop' | 'board' | 'settings' | 'rewards' | 'mode' | null */
  get panel() { return this.#panel; }
  set panel(value) { this.#panel = value; this.emit('panel', value); }
  get panelTab() { return this.#panelTab; }
  set panelTab(value) { this.#panelTab = value; this.emit('panel', this.#panel); }

  /** Aviso breve: { text, kind } */
  get toast() { return this.#toast; }
  set toast(value) { this.#toast = value; this.emit('toast', value); }

  /** Animación a pantalla completa: { kind: 'purchase'|'secret'|'coins'|'pack', item, … } o null */
  get celebration() { return this.#celebration; }
  set celebration(value) { this.#celebration = value; this.emit('celebration', value); }
}
