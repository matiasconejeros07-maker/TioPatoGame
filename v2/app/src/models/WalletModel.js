// Pesos del jugador. La verdad la tiene el servidor.
import { Emitter } from '../core/Emitter.js';

export class WalletModel extends Emitter {
  #balance = 0;
  get balance() { return this.#balance; }
  set balance(value) { const previous = this.#balance; this.#balance = value; this.emit('change', { balance: value, previous }); }
}
