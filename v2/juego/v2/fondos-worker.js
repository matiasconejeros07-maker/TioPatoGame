// Worker de fondos: recibe los lienzos (OffscreenCanvas) de la página y dibuja las escenas en este hilo aparte,
// así el juego tiene el hilo principal para él solo y no se traba aunque el fondo sea pesado.
import { Pintor } from './pintor.js';

const agendar = typeof self.requestAnimationFrame === 'function' ? (fn) => self.requestAnimationFrame(fn) : (fn) => setTimeout(() => fn(performance.now()), 16);
const pintor = new Pintor({ presupuesto: 16, resMax: 1.5, nivelMax: 3, agendar, alCambiarNivel: (n) => self.postMessage({ t: 'nivel', n }) });

self.onmessage = ({ data: m }) => {
  try {
    if (m.t === 'alta') pintor.alta(m.k, m);
    else if (m.t === 'baja') pintor.baja(m.k);
    else if (m.t === 'medida') pintor.medida(m.k, m);
    else if (m.t === 'quieto') pintor.quieto(m.on);
  } catch (err) { self.postMessage({ t: 'error', msg: String(err && err.message || err) }); }
};
self.postMessage({ t: 'listo' });
