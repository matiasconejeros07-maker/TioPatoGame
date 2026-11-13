// La cancha: dibuja lo que hay en MatchModel en cada cuadro y le avisa al controlador de los toques.
import { actions, money, replay } from './dom.js';
import { MatchPhase } from '../models/MatchModel.js';
import { POWERUPS, POWERUP_RULES, MatchMode } from '../../../shared/catalog.js';

const PALETTE = ['#003454', '#033d66', '#074a80', '#17479a', '#4a3aa8', '#8f2a9c', '#c2312f', '#8a1620', '#5a0e14', '#3a070b', '#2a0508'];   // fondo «Clásico»: azul → índigo → morado → rojo
const pad3 = (n) => String(n).padStart(3, '0');

export class MatchView {
  #trail = []; #sparks = []; #dragX = null; #dragId = null; #hudAt = 0;

  constructor(root, { models, controllers }) {
    this.root = root; this.match = models.match; this.models = models; this.controllers = controllers;
    root.innerHTML = `
      <div class="field">
        <div class="scene"></div><div class="veil"></div>
        <div class="big">0</div><canvas></canvas>
        <div class="duck"><div class="rig"><img class="calm" alt=""><img class="angry" alt=""><span class="steam">💢</span></div></div>
        <div class="speech"></div>
        <div class="bubble" hidden></div>
        <div class="ball"><img alt=""></div>
        <div class="paddle"></div>
        <div class="effects"></div><div class="powers"></div>
        <div class="hud">
          <button data-act="quit" aria-label="Salir de la partida">✕</button>
          <div class="score"><div><small>Tú</small><span class="me">000</span></div><span class="mult" hidden></span><div><small>Récord</small><span class="best">000</span></div></div>
          <button data-act="sound" aria-label="Sonido">🔊</button>
        </div>
        <div class="mode-tag"></div><div class="hint">👆 Arrastra el dedo para mover la barra</div>
      </div>`;
    const $ = (selector) => root.querySelector(selector);
    this.el = { field: $('.field'), big: $('.big'), canvas: $('canvas'), duck: $('.duck'), speech: $('.speech'), bubble: $('.bubble'), ball: $('.ball'), paddle: $('.paddle'),
      effects: $('.effects'), powers: $('.powers'), me: $('.me'), best: $('.best'), mult: $('.mult'), veil: $('.veil'), modeTag: $('.mode-tag'), hint: $('.hint'), sound: $('[data-act="sound"]') };
    this.ctx = this.el.canvas.getContext('2d');

    const match = this.match, ctl = controllers.match;
    actions(root, { quit: () => ctl.abandon(), sound: () => controllers.audio.toggleSound(), power: (id) => ctl.activatePowerUp(id) });
    models.settings.on('change', () => { this.el.sound.textContent = models.settings.sound ? '🔊' : '🔇'; });

    match.on('phase', (phase) => { if (phase === MatchPhase.COUNTDOWN) this.#setup(); if (phase === MatchPhase.OVER) replay(this.el.duck, 'taunt', 1900); });
    match.on('frame', (dt) => this.#draw(dt));
    match.on('countdown', () => { if (match.phase === MatchPhase.COUNTDOWN) this.#big(Math.ceil(match.countdown) || ''); });
    match.on('hit', (hit) => this.#onHit(hit));
    match.on('duck-hit', ({ x, y }) => { replay(this.el.duck, 'swing', 280); this.#burst(x, y, 6, ['#fff', '#ffe9a8']); });
    match.on('angry', (angry) => this.el.duck.classList.toggle('is-angry', angry));
    match.on('line', (line) => { this.el.speech.textContent = line; this.el.speech.classList.toggle('show', Boolean(line)); });
    match.on('multiplier', ({ times }) => { this.#shout(`¡Monedas dobles! ×${times}`); replay(this.el.duck, 'hop', 650); });
    match.on('effect', ({ type }) => this.#shout(`${POWERUPS[type].icon} ¡${POWERUPS[type].name}!`));

    // la barra: dedo (arrastre relativo), mouse (posición) y teclado
    const field = this.el.field;
    const move = (e) => {
      if (e.pointerType === 'mouse') ctl.movePaddleTo(e.clientX - field.getBoundingClientRect().left);
      else if (this.#dragX !== null && e.pointerId === this.#dragId) ctl.movePaddleBy(e.clientX - this.#dragX);
      if (e.pointerType === 'mouse' || e.pointerId === this.#dragId) this.#dragX = e.clientX;
    };
    field.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; this.el.hint.hidden = true; this.#dragX = e.clientX; this.#dragId = e.pointerId; try { field.setPointerCapture(e.pointerId); } catch { /* sin captura */ } move(e); });
    field.addEventListener('pointermove', move);
    const release = (e) => { if (e.pointerId === this.#dragId) { this.#dragX = null; this.#dragId = null; } };
    field.addEventListener('pointerup', release); field.addEventListener('pointercancel', release);
    const key = (e, down) => { const k = e.key.toLowerCase(); if (k === 'arrowleft' || k === 'a') ctl.steer(down ? -1 : 0); else if (k === 'arrowright' || k === 'd') ctl.steer(down ? 1 : 0); };
    addEventListener('keydown', (e) => key(e, true)); addEventListener('keyup', (e) => key(e, false));
    addEventListener('resize', () => this.measure());
  }

  /** Le dice al controlador cuánto espacio hay y ajusta la cancha a lo que él decida. */
  measure() {
    if (!this.root.clientWidth) return;
    this.controllers.match.resize(this.root.clientWidth, this.root.clientHeight);
    const m = this.match, { field, canvas } = this.el;
    field.style.width = m.width + 'px'; field.style.height = m.height + 'px'; field.style.setProperty('--k', m.scale.toFixed(3));
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = m.width * ratio; canvas.height = m.height * ratio; this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  #setup() {
    this.measure();
    const m = this.match, el = this.el, k = m.scale;
    const [calm, angry] = el.duck.querySelectorAll('img');
    calm.src = m.character.calm; angry.src = m.character.angry;
    el.duck.className = 'duck'; el.duck.style.width = 141 * k * (m.character.wide || 1) + 'px'; el.duck.style.height = 170 * k + 'px'; el.duck.style.top = 26 * k + 'px';
    el.ball.className = `ball ${m.ball.fx} ${m.ball.tier ? 'premium ' + m.ball.tier : ''}`;
    el.ball.style.width = el.ball.style.height = m.ballSize + 'px'; el.ball.style.setProperty('--bw', m.ball.w);
    el.ball.querySelector('img').src = m.ball.img;
    el.paddle.className = `paddle p-${m.pad}`; el.paddle.style.height = m.paddleHeight + 'px'; el.paddle.style.top = m.paddleTop + 'px';
    el.field.dataset.bg = m.background;
    el.modeTag.textContent = m.mode === MatchMode.ARCADE ? 'Arcade · con power-ups' : 'Clásico';
    el.best.textContent = pad3(this.models.leaderboard?.best[m.mode] ?? 0);
    el.hint.hidden = false; el.mult.hidden = true; el.speech.classList.remove('show');
    this.#trail = []; this.#sparks = []; this.#hudAt = 0;
    this.#big(Math.ceil(m.countdown));
  }

  #big(text) { this.el.big.textContent = text; replay(this.el.big, 'tick', 500); }

  #onHit({ x, y, value, hits }) {
    const el = this.el, m = this.match;
    el.me.textContent = pad3(hits); this.#big(hits); el.hint.hidden = true;
    replay(el.paddle, 'hit', 90);
    if (value > 0) { const pop = document.createElement('div'); pop.className = value > 1 ? 'pop gold' : 'pop'; pop.textContent = '+' + money(value); pop.style.left = x + 'px'; pop.style.top = y - 34 * m.scale + 'px'; el.field.appendChild(pop); setTimeout(() => pop.remove(), 800); }
    this.#burst(x, y, 10, [m.ball.trail, '#fff']);
    const times = Math.floor(hits / 100) + 1;
    el.mult.hidden = times < 2; el.mult.textContent = '×' + times;
  }

  #shout(text) { const el = document.createElement('div'); el.className = 'shout'; el.textContent = text; this.el.field.appendChild(el); setTimeout(() => el.remove(), 1800); }
  #burst(x, y, count, colors) { for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 200; this.#sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 90, life: 0.5, color: colors[i % colors.length] }); } }

  #draw(dt) {
    const m = this.match, el = this.el, k = m.scale;
    el.ball.style.transform = `translate(${m.ballX - m.ballSize / 2}px, ${m.ballY - m.ballSize / 2}px)`;
    el.paddle.style.width = m.paddleWidth + 'px';
    el.paddle.style.transform = `translateX(${m.paddleX - m.paddleWidth / 2}px)`;
    const duckWidth = el.duck.offsetWidth;
    el.duck.style.transform = `translateX(${m.duckX - duckWidth / 2}px)`;
    el.duck.style.setProperty('--anger', m.anger.toFixed(2));
    if (m.line) { const w = el.speech.offsetWidth; el.speech.style.left = Math.min(Math.max(8, m.duckX - 30), m.width - w - 8) + 'px'; el.speech.style.top = m.duckBottom + 14 * k + 'px'; }
    if (m.background === 'clasico') el.field.style.setProperty('--field', PALETTE[m.stage]);

    const bubble = m.bubble;
    el.bubble.hidden = !bubble;
    if (bubble) { el.bubble.textContent = POWERUPS[bubble.type].icon; el.bubble.style.width = el.bubble.style.height = bubble.r * 2 + 'px'; el.bubble.style.transform = `translate(${bubble.x - bubble.r}px, ${bubble.y - bubble.r}px)`; el.bubble.classList.toggle('fading', bubble.life < 2); }

    // estela y chispas
    const ctx = this.ctx;
    ctx.clearRect(0, 0, m.width, m.height);
    if (m.phase === MatchPhase.PLAYING) { this.#trail.push([m.ballX, m.ballY]); if (this.#trail.length > 12) this.#trail.shift(); }
    this.#trail.forEach(([x, y], i) => { ctx.globalAlpha = (i / this.#trail.length) * 0.28; ctx.fillStyle = m.ball?.trail ?? '#fff'; ctx.beginPath(); ctx.arc(x, y, (8 + i * 1.2) * k, 0, 7); ctx.fill(); });
    this.#sparks = this.#sparks.filter((s) => (s.life -= dt) > 0);
    for (const s of this.#sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 500 * dt; ctx.globalAlpha = s.life * 2; ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(s.x, s.y, 3 * k, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;

    // marcadores de efectos y botones de power-ups: basta con refrescarlos unas veces por segundo
    if ((this.#hudAt -= dt) <= 0) { this.#hudAt = 0.12; this.#hud(); }
  }

  #hud() {
    const m = this.match, el = this.el, powerUps = this.controllers.powerUps, clock = this.controllers.match.clock;
    const active = {};
    for (const [type, left] of Object.entries(m.effects)) active[type] = left;
    for (const type of Object.keys(POWERUPS)) { const ms = powerUps?.remainingMs(type, clock) ?? 0; if (ms > 0) active[type] = Math.max(active[type] ?? 0, ms / 1000); }
    el.effects.innerHTML = Object.entries(active).map(([type, left]) => `<span>${POWERUPS[type].icon} ${Math.ceil(left)}</span>`).join('');
    el.veil.className = 'veil' + (active.freeze ? ' freeze' : active.slow ? ' slow' : '');
    el.paddle.classList.toggle('wide', Boolean(active.wide));
    if (m.mode !== MatchMode.ARCADE || !powerUps || m.phase !== MatchPhase.PLAYING) { el.powers.innerHTML = ''; return; }
    const stock = this.models.powerUps.quantities;
    el.powers.innerHTML = Object.entries(POWERUPS).map(([id, p]) => {
      const on = powerUps.isActive(id, clock), blocked = !on && powerUps.refusal(id, clock);
      return `<button data-act="power" data-arg="${id}" class="${on ? 'on' : ''}" ${on || blocked ? 'disabled' : ''} aria-label="${p.name}">${p.icon}<i>${stock[id] ?? 0}</i></button>`;
    }).join('') + `<small>${powerUps.remainingThisMatch}/${POWERUP_RULES.maxPerMatch}</small>`;
  }
}
