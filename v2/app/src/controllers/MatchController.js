// La partida: física de la pelota, barra, personaje, potenciadores y pago por rebote.
// La física es la de la V1 (mismas constantes y fórmulas), para que la dificultad sea exactamente la de siempre.
import { MatchPhase } from '../models/MatchModel.js';
import { MatchMode } from '../../../shared/catalog.js';
import { ECONOMY, DIALOGUE, DEFAULT_EQUIPPED, hitValue, itemOf } from '../../../shared/store.js';

// ── medidas (en una cancha de referencia de 390 × 844; todo escala con K = ancho / 390) ──
const FIELD_W = 390, FIELD_H = 844, V_OFF = 232, ASPECT_MIN = 0.38, ASPECT_MAX = 0.72;
const BALL_SIZE = 56, PADDLE_H = 16, PADDLE_BOTTOM = 40, DUCK_TOP = 26, DUCK_H = 150;
// ── dificultad ──
const SPEED0 = 800, STEP_LO = 4, SPEED_MAX = 2100, SPEED_TAU = 120;       // px/s
const EASE_1 = 55, EASE_2 = 100, EASE_K1 = 0.90, EASE_K2 = 0.95;         // alivio: 10% más lenta hasta el rebote 55, 5% hasta el 100
const PADDLE_START = 0.42, SHRINK_LO = 0.003, SHRINK_HI = 0.0042, SHRINK_MIN = 0.28;
const OLD_TOL = 0.7 * 24, GRAZE = 11.2, PAD_MIN = 26;
const FLUTTER = [[-11, 1, 1], [3, 1.05, 0.8], [12, 1, 1], [-4, 1.05, 0.8]];
// ── potenciadores gratis (las burbujas de la V1): salen en rebotes fijos ──
const FREE_POWERUPS = { slow: { weight: 40 }, freeze: { weight: 30 }, wide: { weight: 30 } };
const BUBBLE_POINTS = [20, 60, 100, 140, 180, 220, 250, 280, 310, 340, 370, 400, 430, 450, 480];
const BUBBLE_LIFE = 8, BUBBLE_BREATH = 3, EFFECT_SECONDS = 10;
const SLOW_FACTOR = { slow: 0.6, freeze: 0.4 }, WIDE_FACTOR = 1.5;
const COUNTDOWN_SECONDS = 3, LINE_SECONDS = 2.6;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : (Math.random() < 0.5 ? -1 : 1));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class MatchController {
  // medidas de choque de la pelota puesta (mitades, en px)
  #bx = 24; #bc = 24; #bh = 24; #by = 24;
  #k = 1; #vs = 1; #vyf = 1; #basePaddle = 160;
  #keyDir = 0; #clock = 0; #running = false; #last = 0;
  #nextBubbleAt = BUBBLE_POINTS[0]; #nextLineAt = 0; #lineLeft = 0;

  /**
   * @param {{ match: import('../models/MatchModel.js').MatchModel, inventory: import('../models/InventoryModel.js').InventoryModel,
   *           onEnded: () => void, powerUps: import('./PowerUpController.js').PowerUpController,
   *           audio: import('./AudioController.js').AudioController, results: { finish(match: object): Promise<unknown> },
   *           requestFrame?: (cb: (t: number) => void) => unknown }} deps
   */
  constructor({ match, inventory, onEnded, powerUps, audio, results, requestFrame = (cb) => requestAnimationFrame(cb) }) {
    this.match = match; this.inventory = inventory; this.onEnded = onEnded; this.powerUps = powerUps; this.audio = audio; this.results = results;
    this.requestFrame = requestFrame;
  }

  /** Reloj de la partida en ms (se detiene si el juego se pausa). Los power-ups de pago se miden con él. */
  get clock() { return this.#clock; }

  // ───────────────────────────── medidas ─────────────────────────────

  /** La vista avisa cuánto espacio hay; aquí se decide el tamaño de la cancha y se reescala lo que esté en juego. */
  resize(availableWidth, availableHeight) {
    const m = this.match;
    let width = availableWidth, height = availableHeight;
    if (width / height > ASPECT_MAX) width = height * ASPECT_MAX; else if (width / height < ASPECT_MIN) height = width / ASPECT_MIN;
    const oldK = this.#k, oldVyf = this.#vyf, oldRange = m.paddleTop - m.duckBottom, oldDuckBottom = m.duckBottom;
    const k = this.#k = Math.max(width / FIELD_W, 0.3);
    this.#vyf = Math.max(0.3, (height / k - V_OFF) / (FIELD_H - V_OFF));
    this.#vs = k * (FIELD_H - 280) / 510;                       // la pelota tarda lo mismo en cruzar la cancha en cualquier pantalla
    m.width = width; m.height = height; m.scale = k;
    m.ballSize = BALL_SIZE * k; m.paddleHeight = PADDLE_H * k;
    m.paddleTop = height - PADDLE_BOTTOM * k - PADDLE_H * k;
    m.duckBottom = (DUCK_TOP + DUCK_H) * k;
    this.#basePaddle = width * PADDLE_START;
    this.#fitBall();
    if (m.phase === MatchPhase.PLAYING || m.phase === MatchPhase.COUNTDOWN) {
      const r = k / oldK, range = m.paddleTop - m.duckBottom;
      m.ballY = m.duckBottom + (m.ballY - oldDuckBottom) * range / Math.max(1, oldRange);
      m.ballX *= r; m.velX *= r; m.velY *= r * this.#vyf / oldVyf; m.paddleX *= r; m.duckX *= r;
    }
    this.#layoutPaddle();
  }

  /** Cada pelota choca con la medida que tiene en pantalla (el billete es más ancho que la moneda, etc.). */
  #fitBall() {
    const ball = this.match.ball ?? itemOf('ball', DEFAULT_EQUIPPED.ball), k = this.#k;
    const hx = BALL_SIZE * k * (ball.w || 1) / 2, hy = hx * (ball.asp || 1);
    let bx = hx, by = hy;
    if (ball.fx === 'spin') bx = by = Math.max(hx, hy);
    else if (ball.fx === 'flutter') {
      let mx = 0, sy = 0, n = 0;
      for (let i = 0; i < FLUTTER.length; i++) for (let j = 0; j < 16; j++) {
        const a = FLUTTER[i], c = FLUTTER[(i + 1) % FLUTTER.length], t = j / 16, angle = (a[0] + (c[0] - a[0]) * t) * Math.PI / 180;
        const w = hx * (a[1] + (c[1] - a[1]) * t), h = hy * (a[2] + (c[2] - a[2]) * t), ca = Math.abs(Math.cos(angle)), sa = Math.abs(Math.sin(angle));
        mx = Math.max(mx, w * ca + h * sa); sy += w * sa + h * ca; n++;
      }
      bx = mx; by = sy / n;
    } else if (ball.fx === 'jump') bx = hx * 1.1;
    this.#bh = ball.fx === 'spin' ? bx : hx;
    this.#bc = Math.max(8 * k, this.#bh - GRAZE * k);
    this.#bx = bx + k; this.#by = by;
  }

  // La zona de golpe total es la misma para todas las pelotas; una pelota más ancha ve una barra más angosta.
  #shrink() { const h = this.match.hits, t = ECONOMY.tier; return h <= t ? 1 - h * SHRINK_LO : Math.max(SHRINK_MIN, 1 - t * SHRINK_LO - (h - t) * SHRINK_HI); }
  #hitWindow() { return this.#basePaddle * this.#shrink() * (this.#active('wide') ? WIDE_FACTOR : 1) + 2 * OLD_TOL * this.#k; }
  #catchTolerance() { return clamp((this.#hitWindow() - this.match.paddleWidth) / 2, 0, this.#bh); }
  #layoutPaddle() {
    const m = this.match;
    m.paddleWidth = Math.max(PAD_MIN * this.#k, this.#hitWindow() - 2 * this.#bc);
    m.paddleX = clamp(m.paddleX || m.width / 2, m.paddleWidth / 2, m.width - m.paddleWidth / 2);
  }

  #ballSpeed() {
    const h = this.match.hits, t = ECONOMY.tier;
    const base = h <= t ? SPEED0 + h * STEP_LO : SPEED_MAX - (SPEED_MAX - SPEED0 - t * STEP_LO) * Math.exp(-(h - t) / SPEED_TAU);
    return base * (h <= EASE_1 ? EASE_K1 : h <= EASE_2 ? EASE_K2 : 1) * this.#vs;
  }

  // ───────────────────────────── potenciadores ─────────────────────────────

  /** ¿Está encendido este efecto, sea por una burbuja gratis o por un power-up de pago? */
  #active(type) { return (this.match.effects[type] ?? 0) > 0 || this.powerUps.isActive(type, this.#clock); }
  #slowFactor() { return Math.min(1, ...Object.keys(SLOW_FACTOR).filter((t) => this.#active(t)).map((t) => SLOW_FACTOR[t])); }
  get #anyEffect() { return ['slow', 'freeze', 'wide'].some((t) => this.#active(t)); }

  /** El jugador toca un power-up de pago (solo en modo arcade). */
  activatePowerUp(id) {
    if (this.match.phase !== MatchPhase.PLAYING) return { ok: false };
    const result = this.powerUps.activate(id, this.#clock);
    if (result.ok) { this.audio.play('power'); this.match.emit('effect', { type: id, paid: true }); this.#layoutPaddle(); }
    return result;
  }

  #spawnBubble() {
    const m = this.match, k = this.#k;
    const total = Object.values(FREE_POWERUPS).reduce((n, p) => n + p.weight, 0);
    let roll = Math.random() * total, type = 'slow';
    for (const [id, p] of Object.entries(FREE_POWERUPS)) { roll -= p.weight; if (roll < 0) { type = id; break; } }
    const top = m.duckBottom + 110 * k, bottom = m.paddleTop - 170 * k;
    m.bubble = { type, x: 60 * k + Math.random() * (m.width - 120 * k), y: top + Math.random() * Math.max(10, bottom - top), r: 26 * k, life: BUBBLE_LIFE };
  }

  #tickPowerUps(dt) {
    const m = this.match;
    // efectos gratis: cuentan hacia atrás; al terminar, 3 rebotes de respiro antes de otra burbuja
    const effects = {}; let ended = false;
    for (const [type, left] of Object.entries(m.effects)) { if (left - dt > 0) effects[type] = left - dt; else ended = true; }
    if (ended || Object.keys(effects).length !== Object.keys(m.effects).length) { m.effects = effects; }
    else m.effects = effects;
    const paidBefore = Object.keys(this.powerUps.match?.active ?? {}).length;
    this.powerUps.tick(this.#clock);
    if (ended || Object.keys(this.powerUps.match?.active ?? {}).length < paidBefore) {
      this.#nextBubbleAt = Math.max(this.#nextBubbleAt, m.hits + BUBBLE_BREATH);
      m.emit('effect-end', {});
      this.#layoutPaddle();
    }
    if (m.bubble) {
      const life = m.bubble.life - dt;
      m.bubble = life > 0 ? { ...m.bubble, life } : null;
    } else if (m.hits >= this.#nextBubbleAt && !this.#anyEffect) {
      this.#spawnBubble();
      this.#nextBubbleAt = BUBBLE_POINTS.find((p) => p > m.hits) ?? Infinity;
    }
  }

  #collectBubble() {
    const m = this.match, { type } = m.bubble;
    m.bubble = null;
    m.effects = { ...m.effects, [type]: EFFECT_SECONDS };
    this.audio.play('power');
    m.emit('effect', { type, paid: false });
    this.#layoutPaddle();
  }

  // ───────────────────────────── partida ─────────────────────────────

  /** Prepara y arranca la partida (lo llama GameFlowController al entrar a PLAYING). */
  begin(mode = MatchMode.CLASSIC) {
    const m = this.match, equipped = { ...DEFAULT_EQUIPPED, ...this.inventory.equipped };
    m.mode = mode;
    m.ball = itemOf('ball', equipped.ball); m.character = itemOf('ch', equipped.ch); m.pad = equipped.pad; m.background = equipped.bg;
    m.hits = 0; m.earned = 0; m.durationMs = 0; m.stage = 0; m.angry = false; m.anger = 0; m.bubble = null; m.effects = {};
    this.#clock = 0; this.#keyDir = 0; this.#nextBubbleAt = BUBBLE_POINTS[0]; this.#nextLineAt = 0; this.#lineLeft = 0;
    this.#fitBall();
    m.paddleX = m.width / 2; m.duckX = m.width / 2;
    this.#layoutPaddle();
    m.ballX = m.duckX; m.ballY = m.duckBottom + this.#by + 4; m.velX = 0; m.velY = 0;
    m.countdown = COUNTDOWN_SECONDS;
    m.phase = MatchPhase.COUNTDOWN;
    this.#say(pick(DIALOGUE.start));
    this.audio.matchStarted();
    this.#last = 0;
    if (!this.#running) { this.#running = true; this.requestFrame((t) => this.#loop(t)); }
  }

  #loop(now) {
    const m = this.match;
    if (m.phase !== MatchPhase.COUNTDOWN && m.phase !== MatchPhase.PLAYING) { this.#running = false; return; }
    const dt = this.#last ? Math.min(0.05, (now - this.#last) / 1000) : 0;   // si la pestaña estuvo en segundo plano, no se «salta» el tiempo
    this.#last = now;
    this.advance(dt);
    this.requestFrame((t) => this.#loop(t));
  }

  /** Avanza la partida `dt` segundos. (Público para poder probar la física sin navegador.) */
  advance(dt) {
    const m = this.match;
    if (this.#keyDir) this.movePaddleBy(this.#keyDir * 900 * this.#k * dt, 1);
    if (this.#lineLeft > 0 && (this.#lineLeft -= dt) <= 0) m.line = '';
    if (m.phase === MatchPhase.COUNTDOWN) {
      const before = Math.ceil(m.countdown), left = m.countdown - dt;
      if (left <= 0) { m.countdown = 0; this.#launch(); m.phase = MatchPhase.PLAYING; this.audio.play('go'); }
      else { m.countdown = left; if (Math.ceil(left) !== before) this.audio.play('tick'); }
    } else if (m.phase === MatchPhase.PLAYING) {
      this.#clock += dt * 1000; m.durationMs = this.#clock;
      this.#tickPowerUps(dt);
      this.#trackDuck(dt);
      // pasos cortos: la pelota nunca avanza más de ~10 px de una vez, así no atraviesa nada
      const steps = Math.max(1, Math.ceil(Math.hypot(m.velX, m.velY) * dt / (10 * this.#k)));
      for (let i = 0; i < steps && m.phase === MatchPhase.PLAYING; i++) this.#step(dt / steps);
    }
    m.emit('frame', dt);
  }

  /** Dirección (dx, dy) con la rapidez actual. Nunca casi horizontal y, salvo los golpes del personaje, tampoco casi vertical. */
  #setVelocity(dx, dy, minX = 0.3) {
    const length = Math.hypot(dx, dy) || 1, minY = 0.34;
    dx /= length; dy /= length;
    if (Math.abs(dx) < minX) { dy = sign(dy) * Math.sqrt(1 - minX * minX); dx = sign(dx) * minX; }
    if (Math.abs(dy) < minY) { dx = sign(dx) * Math.sqrt(1 - minY * minY); dy = sign(dy) * minY; }
    const speed = this.#ballSpeed();
    this.match.velX = dx * speed; this.match.velY = dy * speed * this.#vyf;
  }

  #launch() {
    const m = this.match;
    m.ballX = clamp(m.duckX, this.#bx, m.width - this.#bx); m.ballY = m.duckBottom + this.#by + 4;
    const angle = (Math.random() * 2 - 1) * 1.1;
    this.#setVelocity(Math.sin(angle), Math.cos(angle), 0.1);
  }

  /** Dónde va a llegar la pelota arriba (rebotando en las paredes). */
  #predictX() {
    const m = this.match, slow = this.#slowFactor();
    const t = Math.max(0, (m.ballY - m.duckBottom - this.#by) / Math.max(1, -m.velY * slow)), span = m.width - 2 * this.#bx;
    const u = ((m.ballX - this.#bx + m.velX * t * slow) % (2 * span) + 2 * span) % (2 * span);
    return this.#bx + (u > span ? 2 * span - u : u);
  }

  /** El personaje no sigue la pelota: espera quieto y sale a recibirla justo a tiempo. */
  #trackDuck(dt) {
    const m = this.match, k = this.#k;
    if (m.velY >= 0) return;
    const want = this.#predictX(), left = Math.max(0.06, (m.ballY - m.duckBottom - this.#by) / Math.max(1, -m.velY * this.#slowFactor()));
    const maxMove = Math.max((520 + Math.min(Math.floor(m.hits / 20), 10) * 140) * k, Math.abs(want - m.duckX) / left * 1.15) * dt;
    m.duckX = clamp(m.duckX + clamp(want - m.duckX, -maxMove, maxMove), 40 * k, m.width - 40 * k);
  }

  #step(h) {
    const m = this.match, slow = this.#slowFactor(), bx = this.#bx, by = this.#by;
    const prevX = m.ballX, prevY = m.ballY;
    let x = prevX + m.velX * h * slow, y = prevY + m.velY * h * slow;
    const wall = (dir) => { m.ballX = x; m.ballY = y; this.#setVelocity(dir * Math.abs(m.velX) + (Math.random() - 0.5) * this.#ballSpeed() * 0.08, m.velY / this.#vyf); this.audio.play('wall'); m.emit('wall', {}); };
    if (x < bx) { x = bx; wall(1); } else if (x > m.width - bx) { x = m.width - bx; wall(-1); }

    if (m.velY < 0 && y - by <= m.duckBottom) {                  // el personaje nunca falla, y cada golpe sale en una dirección al azar
      y = m.duckBottom + by; m.duckX = clamp(x, 40 * this.#k, m.width - 40 * this.#k);
      const angle = (Math.random() * 2 - 1) * 1.2;
      this.#setVelocity(Math.sin(angle), Math.cos(angle), 0.1);
      this.audio.play('duck'); m.emit('duck-hit', { x, y });
    }

    const top = m.paddleTop, tolerance = this.#catchTolerance(), reach = m.paddleWidth / 2 + tolerance;
    if (m.velY > 0 && prevY + by <= top + 2 && y + by >= top && Math.abs(x - m.paddleX) <= reach) {
      y = top - by;
      m.ballX = x; m.ballY = y;
      this.#scoreHit(x, top);
      const offset = clamp((x - m.paddleX) / reach + (Math.random() - 0.5) * 0.3, -1, 1);
      this.#setVelocity(Math.sin(offset * 1.05), -Math.cos(offset * 1.05));     // el ángulo depende de dónde pega en la barra
    }
    // La barra también es sólida por las puntas: si la pelota se mete por un costado, rebota contra la punta.
    if (y + by > top + 2 && y - by < top + m.paddleHeight) {
      const dx = x - m.paddleX;
      if (Math.abs(dx) < reach) {
        const fromOutside = Math.abs(prevX - m.paddleX) >= reach, side = fromOutside ? Math.sign(prevX - m.paddleX) : dx < 0 ? -1 : 1;
        x = fromOutside ? m.paddleX + side * reach : x + side * Math.min(10, reach - Math.abs(dx));
        m.velX = side * Math.abs(m.velX);
      }
    }
    m.ballX = x; m.ballY = y;
    if (m.bubble && Math.hypot(x - m.bubble.x, y - m.bubble.y) < m.bubble.r + this.#bh * 0.9) this.#collectBubble();
    if (y - by > m.height) this.#end();                           // se cayó por abajo
  }

  /** Un rebote más: aquí se cuenta el puntaje y lo que paga. */
  #scoreHit(x, top) {
    const m = this.match;
    m.hits += 1;
    const value = m.hits <= ECONOMY.maxHits ? hitValue(m.ball.rate, m.hits) : 0;
    m.earned += value;
    m.stage = Math.min(10, Math.floor(m.hits / 20));
    m.anger = clamp((m.hits - ECONOMY.angryAt) / 25, 0, 1);
    if (!m.angry && m.hits >= ECONOMY.angryAt) m.angry = true;
    this.#layoutPaddle();
    this.audio.bounce(Math.min(m.hits, 60) / 60);
    m.emit('hit', { x, y: top, value, hits: m.hits });
    if (m.hits % ECONOMY.tier === 0) { this.audio.play('fanfare'); m.emit('multiplier', { times: m.hits / ECONOMY.tier + 1 }); }
    if (m.hits >= this.#nextLineAt) {
      const phase = m.hits < 30 ? 'calm' : m.hits < ECONOMY.angryAt ? 'dare' : m.hits < 70 ? 'angry' : 'fury';
      if (this.#nextLineAt) this.#say(pick(DIALOGUE[phase]).replace('%h', m.hits));
      this.#nextLineAt = m.hits + 4 + Math.floor(Math.random() * 7);
    }
  }

  #say(text) { this.match.line = text; this.#lineLeft = LINE_SECONDS; }

  /** El jugador sale con la ✕: la partida termina con lo que lleva. */
  abandon() { if (this.match.phase === MatchPhase.PLAYING || this.match.phase === MatchPhase.COUNTDOWN) this.#end(); }

  #end() {
    const m = this.match;
    m.bubble = null; m.effects = {}; m.line = '';
    m.phase = MatchPhase.OVER;
    this.audio.matchEnded();
    this.onEnded();
    this.results.finish(m);
  }

  // ───────────────────────────── barra ─────────────────────────────

  /** Mouse: la barra va donde está el puntero. */
  movePaddleTo(x) { const m = this.match; if (this.#canMove) m.paddleX = clamp(x, m.paddleWidth / 2, m.width - m.paddleWidth / 2); }
  /** Dedo: la barra se mueve lo que se arrastra (×1,25, así el mismo recorrido cruza la cancha en cualquier pantalla). */
  movePaddleBy(dx, gain = 1.25 * this.#k) { this.movePaddleTo(this.match.paddleX + dx * gain); }
  /** Teclado: -1 izquierda · 1 derecha · 0 quieto. */
  steer(direction) { this.#keyDir = direction; }
  get #canMove() { return this.match.phase === MatchPhase.PLAYING || this.match.phase === MatchPhase.COUNTDOWN; }
}
