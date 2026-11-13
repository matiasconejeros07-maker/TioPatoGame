// Todo lo que cambia durante una partida. Solo datos: quien los mueve es MatchController.
import { Emitter } from '../core/Emitter.js';

export const MatchPhase = Object.freeze({ IDLE: 'idle', COUNTDOWN: 'countdown', PLAYING: 'playing', OVER: 'over' });

const FIELDS = {
  phase: MatchPhase.IDLE,   // en qué momento de la partida estamos
  mode: 'classic',          // classic | arcade
  countdown: 0,             // segundos que faltan para que salga la pelota
  hits: 0,                  // rebotes
  earned: 0,                // pesos ganados en esta partida
  durationMs: 0,
  width: 390, height: 844, scale: 1,                                    // medidas de la cancha
  ballX: 0, ballY: 0, velX: 0, velY: 0, ballSize: 56,
  paddleX: 195, paddleWidth: 160, paddleTop: 780, paddleHeight: 16,
  duckX: 195, duckBottom: 176,
  angry: false,             // el personaje ya se enojó (cambia de dibujo)
  anger: 0,                 // de 0 (tranquilo) a 1 (furia)
  line: '',                 // lo que está diciendo el personaje
  stage: 0,                 // tramo de la partida (0 a 10): el fondo clásico cambia de color con él
  bubble: null,             // potenciador gratis flotando: { type, x, y, r, life } o null
  effects: {},              // potenciadores gratis encendidos: tipo → segundos que le quedan
  ball: null, character: null, pad: 'clasica', background: 'clasico',   // lo que el jugador lleva puesto
};
/** Campos cuyo cambio se avisa a las vistas (los demás se leen en cada cuadro). */
const NOTIFY = new Set(['phase', 'line', 'hits', 'angry', 'countdown']);

export class MatchModel extends Emitter {
  constructor() {
    super();
    const values = { ...FIELDS };
    for (const key of Object.keys(FIELDS)) {
      Object.defineProperty(this, key, {
        enumerable: true,
        get: () => values[key],
        set: (value) => { values[key] = value; if (NOTIFY.has(key)) this.emit(key, value); },
      });
    }
  }
}
