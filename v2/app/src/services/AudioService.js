// Sonido con Web Audio, todo sintetizado (no hay archivos de audio): música de fondo y efectos.
// La mezcla es deliberadamente suave: los rebotes suenan cientos de veces por partida y no deben cansar.

const BOUNCE_GAIN = 0.11;       // volumen de TODOS los sonidos de rebote (normalizados al mismo nivel percibido)
const MUSIC_GAIN = 0.055;
const SFX_GAIN = 0.16;

// Cada sonido de rebote: lista de «voces» { type, f: [inicio, fin] Hz, d: duración s, g: ganancia relativa, at: retraso s, noise }.
// `g` compensa que unas ondas suenan más fuertes que otras (una cuadrada «pesa» más que una senoidal).
const BOUNCES = {
  clasico: [{ type: 'triangle', f: [560, 560], d: 0.07, g: 1 }],
  cuac: [{ type: 'sawtooth', f: [520, 300], d: 0.13, g: 0.5, q: 900 }, { type: 'square', f: [260, 150], d: 0.13, g: 0.22, q: 900 }],
  bip: [{ type: 'square', f: [1318, 1318], d: 0.075, g: 0.32 }],
  cash: [{ noise: true, d: 0.05, g: 0.45, q: 5200 }, { type: 'triangle', f: [1568, 1568], d: 0.09, g: 0.6, at: 0.04 }, { type: 'triangle', f: [2093, 2093], d: 0.16, g: 0.6, at: 0.1 }],
  kling: [{ type: 'sine', f: [2637, 2637], d: 0.22, g: 0.75 }, { type: 'sine', f: [3951, 3951], d: 0.16, g: 0.35 }],
  gota: [{ type: 'sine', f: [420, 980], d: 0.09, g: 1 }],
  laser: [{ type: 'sawtooth', f: [1500, 240], d: 0.11, g: 0.4 }],
};

// Música: 4 secciones de 4 compases en La menor/Do mayor, a 112 pulsos. Cambia el bajo, la armonía y la melodía
// en cada sección y la melodía varía en cada vuelta, para que no sea un bucle corto y monótono.
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const hz = (name) => { const [, n, acc, oct] = /^([A-G])(#?)(\d)$/.exec(name); return 440 * 2 ** ((NOTE[n] + (acc ? 1 : 0) - 9) / 12 + (Number(oct) - 4)); };
const SECTIONS = [
  { chords: ['A2', 'F2', 'C3', 'G2'], lead: ['E5', 'A5', 'G5', 'E5', 'F5', 'A5', 'C6', 'A5', 'G5', 'E5', 'C5', 'E5', 'D5', 'G5', 'B5', 'G5'] },
  { chords: ['F2', 'G2', 'A2', 'A2'], lead: ['C5', 'F5', 'A5', 'F5', 'D5', 'G5', 'B5', 'D6', 'C6', 'A5', 'E5', 'A5', 'E5', null, 'A5', null] },
  { chords: ['D3', 'G2', 'C3', 'A2'], lead: ['F5', 'A5', 'D6', 'A5', 'G5', 'B5', 'D6', 'B5', 'E5', 'G5', 'C6', 'G5', 'A5', 'C6', 'E6', 'C6'] },
  { chords: ['F2', 'E2', 'A2', 'G2'], lead: ['A5', null, 'F5', 'C5', 'G#5', null, 'E5', 'B4', 'A5', 'E5', 'C5', 'E5', 'B5', 'G5', 'D5', 'G5'] },
];
const STEP = 60 / 112 / 2;          // una corchea

export class AudioService {
  #ctx = null;
  #master = null;
  #musicBus = null;
  #timer = null;
  #step = 0;
  #nextAt = 0;
  #noise = null;

  /** Hay que llamarlo dentro de un toque del jugador: los navegadores no dejan sonar antes. */
  unlock() {
    if (!this.#ctx) {
      const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Ctx) return false;
      this.#ctx = new Ctx();
      // Compresor suave al final: evita picos cuando coinciden música, rebote y premio.
      const limiter = this.#ctx.createDynamicsCompressor();
      limiter.threshold.value = -14; limiter.ratio.value = 6; limiter.attack.value = 0.003; limiter.release.value = 0.2;
      this.#master = this.#ctx.createGain();
      this.#master.connect(limiter).connect(this.#ctx.destination);
      this.#musicBus = this.#ctx.createGain();
      this.#musicBus.gain.value = MUSIC_GAIN;
      this.#musicBus.connect(this.#master);
      const length = this.#ctx.sampleRate * 0.3;
      this.#noise = this.#ctx.createBuffer(1, length, this.#ctx.sampleRate);
      const data = this.#noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.#ctx.state === 'suspended') this.#ctx.resume().catch(() => {});
    return true;
  }

  #voice({ type = 'sine', f = [440, 440], d = 0.1, g = 1, at = 0, noise = false, q = 0 }, gain, bus = this.#master, when = this.#ctx.currentTime) {
    const ctx = this.#ctx, start = when + at;
    const source = noise ? ctx.createBufferSource() : ctx.createOscillator();
    if (noise) source.buffer = this.#noise;
    else { source.type = type; source.frequency.setValueAtTime(f[0], start); if (f[1] !== f[0]) source.frequency.exponentialRampToValueAtTime(f[1], start + d); }
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * g), start + 0.006);     // ataque corto: sin «clic»
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + d);
    let node = source;
    if (q) { const filter = ctx.createBiquadFilter(); filter.type = noise ? 'highpass' : 'lowpass'; filter.frequency.value = q; node = source.connect(filter); }
    node.connect(envelope).connect(bus);
    source.start(start); source.stop(start + d + 0.03);
  }

  /** Sonido de rebote. `pitch` (0 a 1) lo sube apenas a medida que avanza la partida. */
  bounce(id, pitch = 0) {
    if (!this.#ctx) return;
    const up = 1 + pitch * 0.18;
    for (const voice of BOUNCES[id] ?? BOUNCES.clasico) this.#voice({ ...voice, f: voice.f?.map((v) => v * up) }, BOUNCE_GAIN);
  }

  /** Efectos del juego. */
  play(name) {
    if (!this.#ctx) return;
    const tones = {
      wall: [{ type: 'triangle', f: [260, 260], d: 0.04, g: 0.4 }],
      duck: [{ type: 'sawtooth', f: [330, 210], d: 0.1, g: 0.35, q: 800 }],
      tick: [{ type: 'square', f: [660, 660], d: 0.06, g: 0.3 }],
      go: [{ type: 'square', f: [990, 990], d: 0.16, g: 0.3 }],
      lose: [{ type: 'sawtooth', f: [330, 110], d: 0.5, g: 0.5, q: 900 }],
      coin: [{ type: 'sine', f: [1568, 1568], d: 0.08, g: 0.7 }, { type: 'sine', f: [2093, 2093], d: 0.2, g: 0.7, at: 0.07 }],
      buy: [0, 1, 2, 3].map((i) => ({ type: 'triangle', f: [[523, 659, 784, 1047][i]].flatMap((v) => [v, v]), d: 0.14, g: 0.7, at: i * 0.07 })),
      power: [{ type: 'sine', f: [400, 1200], d: 0.25, g: 0.7 }],
      tap: [{ type: 'sine', f: [700, 700], d: 0.03, g: 0.35 }],
      fanfare: [523, 659, 784, 1047, 1319, 1568].map((v, i) => ({ type: 'triangle', f: [v, v], d: 0.3, g: 0.8, at: i * 0.11 })),
      reveal: [{ type: 'sine', f: [110, 880], d: 2.2, g: 0.6 }, { noise: true, d: 0.3, g: 0.2, q: 3000, at: 2.2 }],
    }[name];
    for (const voice of tones ?? []) this.#voice(voice, SFX_GAIN);
  }

  startMusic() {
    if (!this.#ctx || this.#timer) return;
    this.#nextAt = this.#ctx.currentTime + 0.08;
    this.#timer = setInterval(() => this.#schedule(), 60);
  }

  stopMusic() { clearInterval(this.#timer); this.#timer = null; }

  /** Programa las notas del próximo cuarto de segundo (el reloj del audio es exacto; el del navegador no). */
  #schedule() {
    while (this.#nextAt < this.#ctx.currentTime + 0.25) {
      const step = this.#step++, when = this.#nextAt;
      this.#nextAt += STEP;
      const bar = Math.floor(step / 8), beat = step % 8;
      const lap = Math.floor(bar / 16);                                   // cuántas veces ha sonado el tema completo
      const section = SECTIONS[Math.floor(bar / 4) % SECTIONS.length];
      const root = hz(section.chords[bar % 4]);
      const play = (voice, gain) => this.#voice(voice, gain, this.#musicBus, when);
      // bajo: salta de octava en los tiempos débiles
      if (beat % 2 === 0) play({ type: 'triangle', f: [root, root], d: STEP * 1.6, g: 1 }, 1);
      else if (beat === 3 || beat === 7) play({ type: 'triangle', f: [root * 2, root * 2], d: STEP * 0.8, g: 0.6 }, 1);
      // acorde arpegiado
      const third = /^[ADE]/.test(section.chords[bar % 4]) ? 1.189 : 1.26;  // menor o mayor
      play({ type: 'sine', f: [root * 4 * [1, third, 1.498, third][beat % 4]].flatMap((v) => [v, v]), d: STEP * 0.9, g: 0.35 }, 1);
      // percusión: bombo, caja de ruido y platillo
      if (beat === 0 || beat === 4 || (beat === 3 && bar % 2)) play({ type: 'sine', f: [150, 45], d: 0.12, g: 1.1 }, 1);
      if (beat === 2 || beat === 6) play({ noise: true, d: 0.07, g: 0.45, q: 2500 }, 1);
      play({ noise: true, d: 0.025, g: beat % 2 ? 0.12 : 0.2, q: 7000 }, 1);
      // melodía: una nota por corchea en los compases pares; en los impares responde con silencios distintos en cada vuelta
      const index = ((bar % 4) * 4 + (beat >> 1)) % 16;
      const note = section.lead[index];
      const rests = (bar % 2 === 1) && ((beat + lap + bar) % 3 === 0);
      if (note && beat % 2 === 0 && !rests) play({ type: lap % 2 ? 'square' : 'triangle', f: [hz(note), hz(note)], d: STEP * 1.7, g: lap % 2 ? 0.28 : 0.6 }, 1);
      else if (note && beat % 2 === 1 && (bar + lap) % 4 === 3) play({ type: 'triangle', f: [hz(note) * 1.5, hz(note) * 1.5], d: STEP * 0.7, g: 0.3 }, 1);
    }
  }
}
