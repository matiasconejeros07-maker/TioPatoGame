// VISTA · el pintor de los fondos: dibuja las escenas de escenas.js en sus lienzos con un presupuesto de tiempo.
// Lo usan el worker de fondos (lo normal: dibuja en otro hilo y el juego no se entera) y, si el teléfono no tiene
// worker con lienzo, el hilo principal (con un presupuesto más estricto, porque ahí compite con el juego).
//
// Control de calidad automático: mide cuánto tarda cada cuadro y, si se pasa del presupuesto, baja un escalón
// (menos resolución y menos cuadros por segundo); si le sobra tiempo de manera sostenida, sube uno. Así cada
// teléfono queda en el mejor punto que puede sostener sin trabarse.
import { ESCENAS } from './escenas.js';

/** Escalones de calidad: multiplicador de resolución y cuadros por segundo. */
export const NIVELES = [
  { res: 1, fps: 30 }, { res: .85, fps: 30 }, { res: .72, fps: 24 }, { res: .6, fps: 20 }, { res: .5, fps: 15 }, { res: .42, fps: 10 },
];

export class Pintor {
  #vistas = new Map(); #quieto = false; #nivel; #ema = 0; #malos = 0; #buenos = 0; #ultimo = 0; #reloj = 0; #prev = 0; #ritmo = 16.7;

  /**
   * @param {{ presupuesto: number, nivelInicial?: number, resMax: number, agendar: (fn: (t: number) => void) => void, alCambiarNivel?: (n: number) => void }} op
   *   presupuesto: milisegundos por cuadro que puede gastar dibujando · resMax: tope de píxeles por píxel CSS
   */
  constructor(op) { this.op = op; this.#nivel = op.nivelInicial ?? 0; }

  get nivel() { return this.#nivel; }

  alta(k, { canvas, id, w, h, dpr, grande }) {
    if (!ESCENAS[id]) return;
    this.#vistas.set(k, { k, canvas, g: canvas.getContext('2d', { alpha: false }), id, w, h, dpr: dpr || 1, grande: !!grande, visible: true, e: null, medida: '', t: Math.random() * 100, pintado: false });
    this.#despertar();
  }
  baja(k) { this.#vistas.delete(k); }
  medida(k, { w, h, visible }) { const v = this.#vistas.get(k); if (!v) return; if (w) { v.w = w; v.h = h; } v.visible = visible; this.#despertar(); }
  quieto(on) { this.#quieto = on; this.#despertar(); }

  #despertar() { if (!this.#reloj) { this.#reloj = 1; this.#ultimo = performance.now(); this.op.agendar((t) => this.#cuadro(t)); } }

  #cuadro(ahora) {
    const activas = [...this.#vistas.values()].filter((v) => v.visible && v.w > 4 && v.h > 4);
    const pendientes = activas.some((v) => !v.pintado || v.medida !== this.#clave(v));
    if (!activas.length || (this.#quieto && !pendientes)) { this.#reloj = 0; return; }   // nada que animar: se duerme hasta el próximo aviso
    this.op.agendar((t) => this.#cuadro(t));
    if (this.op.medirCuadro && !this.#quieto) {                                         // hilo principal: manda el ritmo real de la pantalla
      if (this.#prev) { const ms = Math.min(80, ahora - this.#prev); this.#ritmo = this.#ritmo * .92 + ms * .08; this.#ajustarRitmo(); }
      this.#prev = ahora;
    }
    const { fps } = NIVELES[this.#nivel];
    if (ahora - this.#ultimo < 1000 / fps - 2 && !pendientes) return;
    const dt = Math.min(.1, (ahora - this.#ultimo) / 1000); this.#ultimo = ahora;
    let gasto = 0;
    for (const v of activas) {
      const clave = this.#clave(v);
      if (clave !== v.medida) {                                                         // tamaño o resolución nuevos: se rearma la escena
        const r = this.#res(v);
        v.medida = clave; v.canvas.width = Math.max(1, Math.round(v.w * r)); v.canvas.height = Math.max(1, Math.round(v.h * r));
        v.e = { w: v.w, h: v.h, ratio: r, s: {} }; ESCENAS[v.id].crear(v.e); v.pintado = false;
      }
      if (this.#quieto && v.pintado) continue;                                          // modo liviano: un cuadro quieto y listo
      v.t += dt;
      const t0 = performance.now();                                                     // solo cuenta el dibujo (rearmar una escena es aparte y ocasional)
      const g = v.g, r = v.e.ratio; g.setTransform(r, 0, 0, r, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      try { ESCENAS[v.id].dibujar(g, v.e, v.t, dt); } catch (err) { this.#vistas.delete(v.k); }
      v.pintado = true; gasto += performance.now() - t0;
    }
    if (!this.#quieto && !this.op.medirCuadro) this.#ajustar(gasto);
  }

  #res(v) { return Math.max(.35, Math.min(v.dpr, this.op.resMax) * (v.grande ? NIVELES[this.#nivel].res : 1)); }   // las vistas previas son chicas: siempre nítidas
  #clave(v) { return `${Math.round(v.w)}x${Math.round(v.h)}@${this.#res(v).toFixed(2)}`; }

  #ajustar(ms) {
    this.#ema = this.#ema * .85 + ms * .15;
    const p = this.op.presupuesto;
    if (this.#ema > p) { this.#buenos = 0; if (++this.#malos >= 8 && this.#nivel < (this.op.nivelMax ?? NIVELES.length - 1)) this.#cambiar(this.#nivel + 1); }
    else if (this.#ema < p * .35) { this.#malos = 0; if (++this.#buenos >= 150 && this.#nivel > (this.op.nivelMin || 0)) this.#cambiar(this.#nivel - 1); }
    else { this.#malos = 0; this.#buenos = 0; }
  }
  /** En el hilo principal el dibujo se paga después (al pintar la página): se mira si la pantalla sostiene ~60 cuadros. */
  #ajustarRitmo() {
    if (this.#ritmo > 18.8) { this.#buenos = 0; if (++this.#malos >= 20 && this.#nivel < (this.op.nivelMax ?? NIVELES.length - 1)) { this.#cambiar(this.#nivel + 1); this.#ritmo = 16.7; } }
    else if (this.#ritmo < 17.4) { this.#malos = 0; if (++this.#buenos >= 400 && this.#nivel > (this.op.nivelMin || 0)) { this.#cambiar(this.#nivel - 1); this.#ritmo = 16.7; } }
    else { this.#malos = 0; this.#buenos = 0; }
  }
  #cambiar(n) { this.#nivel = n; this.#malos = this.#buenos = 0; this.#ema = this.op.presupuesto * .6; this.op.alCambiarNivel?.(n); }
}
