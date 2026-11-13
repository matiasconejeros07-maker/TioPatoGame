// Resultado de la última partida, para la pantalla de resumen.
import { Emitter } from '../core/Emitter.js';

export class ResultModel extends Emitter {
  #last = null;
  /** @returns {{ hits: number, earned: number, mode: string, isRecord: boolean, best: number, seconds: number, saved: boolean } | null} */
  get last() { return this.#last; }
  set last(value) { this.#last = value; this.emit('change', value); }
}
