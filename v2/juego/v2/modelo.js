// MODELO de la V2: solo datos (getters y setters) y aviso de cambios. La lógica está en controladores.js.
export class Emitter {
  #l = new Map();
  on(ev, fn) { if (!this.#l.has(ev)) this.#l.set(ev, new Set()); this.#l.get(ev).add(fn); return () => this.#l.get(ev).delete(fn); }
  emit(ev, data) { for (const fn of [...(this.#l.get(ev) ?? [])]) fn(data); }
}

/** Lo de la V2 que es de la cuenta (vive en el servidor: v2/<uid>). */
export class CuentaV2 extends Emitter {
  #uid = null; #powerUps = { slow: 0, freeze: 0, wide: 0 }; #sinAnuncios = false; #nombreCambiadoEn = 0; #mejorArcade = 0;
  get uid() { return this.#uid; }
  set uid(v) { this.#uid = v; }
  /** Power-ups guardados (de pago). */
  get powerUps() { return { ...this.#powerUps }; }
  set powerUps(v) { this.#powerUps = { slow: 0, freeze: 0, wide: 0, ...v }; this.emit('cambio'); }
  get sinAnuncios() { return this.#sinAnuncios; }
  set sinAnuncios(v) { this.#sinAnuncios = !!v; this.emit('cambio'); }
  /** Cuándo cambió el nombre por última vez (ms). 0 = nunca. */
  get nombreCambiadoEn() { return this.#nombreCambiadoEn; }
  set nombreCambiadoEn(v) { this.#nombreCambiadoEn = +v || 0; this.emit('cambio'); }
  get mejorArcade() { return this.#mejorArcade; }
  set mejorArcade(v) { this.#mejorArcade = +v || 0; this.emit('cambio'); }
}

/** Preferencias de este teléfono. */
export class PreferenciasV2 extends Emitter {
  #musica = true; #consentimiento = null; #partidasSinAnuncio = 0; #modo = 'classic';
  get musica() { return this.#musica; }
  set musica(v) { this.#musica = !!v; this.emit('cambio'); }
  /** null = todavía no responde · 'si' · 'no' (anuncios no personalizados). */
  get consentimiento() { return this.#consentimiento; }
  set consentimiento(v) { this.#consentimiento = v; this.emit('cambio'); }
  get partidasSinAnuncio() { return this.#partidasSinAnuncio; }
  set partidasSinAnuncio(v) { this.#partidasSinAnuncio = v; this.emit('cambio'); }
  /** Último modo elegido: classic | arcade. */
  get modo() { return this.#modo; }
  set modo(v) { this.#modo = v; this.emit('cambio'); }
}

/** La partida en curso, en lo que toca a la V2. */
export class PartidaV2 extends Emitter {
  #modo = 'classic'; #usados = []; #enJuego = false;
  get modo() { return this.#modo; }
  set modo(v) { this.#modo = v; }
  /** Power-ups de pago usados en esta partida. */
  get usados() { return [...this.#usados]; }
  set usados(v) { this.#usados = [...v]; this.emit('cambio'); }
  get enJuego() { return this.#enJuego; }
  set enJuego(v) { this.#enJuego = v; this.emit('cambio'); }
}
