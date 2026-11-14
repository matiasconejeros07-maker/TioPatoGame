// VISTA · motor de los fondos premium (atardecer, cristal, aurora, galaxia, holo, boveda y prisma). Synthwave, Agujero
// negro y Clásico quedan exactamente como en la V1. Pone un lienzo en el fondo de la partida (#theme) y en cada vista
// previa de la tienda (.bgx[data-bg]) y los entrega al pintor (v2/pintor.js).
//
// Rendimiento (para que el juego vaya siempre fluido):
//  · Si el teléfono puede, los lienzos se pasan a un WORKER (OffscreenCanvas): el fondo se dibuja en otro hilo y el
//    juego tiene el hilo principal para él solo. Si no puede (o el worker falla), se dibuja aquí con un presupuesto
//    de tiempo mucho más chico y menos resolución.
//  · Nada se mide en cada cuadro: el tamaño y si se ve o no llegan por ResizeObserver e IntersectionObserver (medir la
//    página en cada cuadro obliga al navegador a recalcular el diseño en plena partida).
//  · Calidad automática: si un cuadro tarda más de lo presupuestado se baja resolución y cuadros por segundo.
//  · Modo liviano de la V1, «reducir movimiento» o la app en segundo plano: el fondo queda quieto (un solo cuadro).
import { ESCENAS } from './escenas.js';
import { Pintor } from './pintor.js';

export const FONDOS_NUEVOS = Object.keys(ESCENAS);

export class Fondos {
  #modo = 'local'; #worker = null; #pintor = null; #vivos = new Map(); #n = 0; #io; #ro; #listo = false;

  constructor() {
    if (this.#puedeWorker()) this.#arrancarWorker(); else this.#aLocal();
    this.#io = new IntersectionObserver((es) => { for (const en of es) { const v = en.target.__v2fondo; if (v) { v.dentro = en.isIntersecting; this.#medir(v, en.boundingClientRect); } } });
    this.#ro = new ResizeObserver((es) => { for (const en of es) { const v = en.target.__v2fondo; if (v) this.#medir(v, en.contentRect); } });
    new MutationObserver(() => this.#buscar()).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-bg'] });
    new MutationObserver(() => { this.#avisarQuieto(); const t = document.getElementById('theme'); t && t.__v2fondo && this.#enviarMedida(t.__v2fondo); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', () => this.#avisarQuieto());
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => this.#avisarQuieto());
    this.#buscar(); this.#avisarQuieto();
  }

  /** Nivel de calidad en uso (0 = máximo) y si se dibuja en otro hilo: para diagnóstico. */
  get estado() { return { modo: this.#modo, nivel: this.#modo === 'local' ? this.#pintor.nivel : this.nivelWorker ?? 0 }; }

  #puedeWorker() {
    try { return typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && 'transferControlToOffscreen' in HTMLCanvasElement.prototype && !!new OffscreenCanvas(1, 1).getContext('2d'); }
    catch (e) { return false; }
  }

  #arrancarWorker() {
    try {
      const src = window.__V2_FONDOS_WORKER, url = src ? URL.createObjectURL(new Blob([src], { type: 'text/javascript' })) : new URL('fondos-worker.js', document.baseURI).href;
      const w = new Worker(url);
      w.onmessage = ({ data: m }) => { if (m.t === 'listo') this.#listo = true; else if (m.t === 'nivel') this.nivelWorker = m.n; else if (m.t === 'error') this.#aLocal(); };
      w.onerror = (ev) => { ev.preventDefault?.(); this.#aLocal(); };
      this.#worker = w; this.#modo = 'worker';
    } catch (e) { this.#aLocal(); }
  }

  /** Sin worker: se dibuja en el hilo del juego, a resolución 1× como máximo, y la calidad se ajusta mirando si la pantalla sostiene ~60 cuadros. */
  #aLocal() {
    if (this.#modo === 'local' && this.#pintor) return;
    if (this.#worker) { try { this.#worker.terminate(); } catch (e) {} this.#worker = null; }
    this.#modo = 'local';
    this.#pintor = new Pintor({ presupuesto: 4, resMax: 1, nivelInicial: 1, nivelMin: 1, medirCuadro: true, agendar: (fn) => requestAnimationFrame(fn) });
    for (const v of this.#vivos.values()) { v.cv.remove(); this.#crearLienzo(v); }    // los lienzos ya entregados al worker no se pueden recuperar: van nuevos
    this.#avisarQuieto();
  }

  #buscar() {
    for (const el of document.querySelectorAll('.bgx[data-bg]')) {
      const id = el.dataset.bg, ya = el.__v2fondo;
      if (ya && ya.id === id) continue;
      if (ya) this.#quitar(ya);
      if (!ESCENAS[id]) continue;
      const v = { k: ++this.#n, el, id, cv: null, dentro: false, w: 0, h: 0, enviado: '' };
      el.__v2fondo = v; this.#vivos.set(v.k, v); this.#crearLienzo(v);
      this.#io.observe(el); this.#ro.observe(el);
    }
    for (const v of this.#vivos.values()) if (!v.el.isConnected) this.#quitar(v);
  }

  #crearLienzo(v) {
    const cv = document.createElement('canvas'); cv.className = 'v2bg'; cv.setAttribute('aria-hidden', 'true'); v.el.appendChild(cv); v.cv = cv; v.enviado = '';
    const datos = { k: v.k, id: v.id, w: v.w, h: v.h, dpr: devicePixelRatio || 1, grande: v.el.id === 'theme' };
    if (this.#modo === 'worker') { const off = cv.transferControlToOffscreen(); this.#worker.postMessage({ t: 'alta', ...datos, canvas: off }, [off]); }
    else this.#pintor.alta(v.k, { ...datos, canvas: cv });
    this.#enviarMedida(v);
  }

  #quitar(v) {
    this.#io.unobserve(v.el); this.#ro.unobserve(v.el); v.cv && v.cv.remove(); v.el.__v2fondo = null; this.#vivos.delete(v.k);
    if (this.#modo === 'worker') this.#worker.postMessage({ t: 'baja', k: v.k }); else this.#pintor.baja(v.k);
  }

  #medir(v, r) { if (r && r.width) { v.w = r.width; v.h = r.height; } this.#enviarMedida(v); }

  #enviarMedida(v) {
    const visible = v.dentro && v.w > 4 && v.h > 4 && (v.el.id !== 'theme' || document.body.classList.contains('themed'));
    const clave = `${Math.round(v.w)}x${Math.round(v.h)}:${visible}`; if (clave === v.enviado) return; v.enviado = clave;
    const m = { k: v.k, w: v.w, h: v.h, visible };
    if (this.#modo === 'worker') this.#worker.postMessage({ t: 'medida', ...m }); else this.#pintor.medida(v.k, m);
  }

  #avisarQuieto() {
    const on = document.hidden || document.body.classList.contains('lite') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.#modo === 'worker') this.#worker && this.#worker.postMessage({ t: 'quieto', on }); else this.#pintor && this.#pintor.quieto(on);
  }
}
