// Resumen de la partida.
import { actions, money, COIN } from './dom.js';
import { MatchMode } from '../../../shared/catalog.js';

export class GameOverView {
  constructor(root, { models, controllers }) {
    this.root = root; this.models = models;
    const { flow, nav } = controllers;
    const leave = (then) => flow.leaveGameOver().then(then);
    actions(root, {
      again: () => flow.leaveGameOver('playing'),
      shop: () => leave(() => nav?.open('shop', 'powerups')),
      board: () => leave(() => nav?.open('board', models.result.last?.mode ?? 'classic')),
      back: () => flow.leaveGameOver(),
    });
    models.result.on('change', () => this.render());
  }

  render() {
    const { models } = this, r = models.result.last;
    if (!r) return;
    const m = models.match, practice = models.session.practice;
    const paid = r.earned > 0 && !practice;
    this.root.innerHTML = `
      <div class="rain"></div>
      <div style="z-index:1">
        <img class="hero-small" src="${m.character.calm}" alt="">
        <h2>Ganó ${/^Tíos/.test(m.character.name) ? 'los' : /^Tía/.test(m.character.name) ? 'la' : 'el'} ${m.character.name}</h2>
        <div class="count">${r.hits} <small>rebotes</small></div>
        <p class="line">Aguantaste ${r.seconds} s · ${r.mode === MatchMode.ARCADE ? 'Arcade' : 'Clásico'} · ${money(m.ball.rate)} por punto</p>
        <p class="earned">${practice ? 'Modo práctica: no suma pesos' : paid ? `¡Ganaste ${money(r.earned)}!` : r.saved ? 'Sin pesos esta vez. ¡Rebota más!' : 'Guardando tu partida…'}</p>
        ${r.isRecord ? '<span class="record">🏆 ¡Nuevo récord!</span>' : practice ? '' : `<p class="line">Tu mejor puntaje: ${r.best}</p>`}
      </div>
      <div class="stack">
        <button class="btn dark" data-act="again">↻ Jugar de nuevo</button>
        ${practice ? '' : '<button class="btn ghost" data-act="shop">🛍️ Gastar mis pesos</button><button class="btn ghost" data-act="board">🏆 Ver marcadores</button>'}
        <button class="link" data-act="back">Volver</button>
      </div>`;
    if (paid) this.#rain(m.ball.img ?? COIN);
  }

  #rain(src) {
    const rain = this.root.querySelector('.rain');
    for (let i = 0; i < 22; i++) {
      const img = document.createElement('img');
      img.src = src; img.alt = ''; img.style.left = Math.random() * 92 + '%'; img.style.width = 28 + Math.random() * 30 + 'px';
      img.style.animationDuration = 2.2 + Math.random() * 2.6 + 's'; img.style.animationDelay = Math.random() * 1.6 + 's';
      rain.appendChild(img);
    }
  }
}
