// Menú principal. Mismas posiciones que la V1: saldo arriba a la derecha, personaje, título, botones.
import { actions, money, COIN, replay } from './dom.js';
import { itemOf, DEFAULT_EQUIPPED } from '../../../shared/store.js';

export class MenuView {
  constructor(root, { models, controllers, storeLinks }) {
    this.root = root; this.models = models; this.controllers = controllers; this.storeLinks = storeLinks;
    const { nav } = controllers;
    actions(root, {
      play: () => (models.session.practice ? controllers.flow.startMatch('classic') : nav.open('mode')),
      shop: () => nav.open('shop', 'powerups'),
      board: () => nav.open('board', 'classic'),
      settings: () => nav.open('settings'),
      rewards: (tab) => nav.open('rewards', tab),
    });
    for (const model of [models.wallet, models.inventory, models.rewards, models.profile]) model?.on('change', () => this.render());
    models.wallet?.on('change', () => { const chip = root.querySelector('.chip'); if (chip) replay(chip, 'bump', 400); });
    this.render();
  }

  render() {
    const { models, controllers } = this;
    const practice = models.session.practice;
    const character = itemOf('ch', models.inventory?.equipped.ch ?? DEFAULT_EQUIPPED.ch);
    const badges = controllers.rewards?.badges ?? {};
    const dot = (on) => (on ? '<i class="dot" aria-label="Premio disponible"></i>' : '');
    this.root.innerHTML = `
      <div class="menu-top">
        <span class="tag">${practice ? 'Modo práctica' : 'Demo'}</span>
        ${practice ? '' : `<span class="chip"><img src="${COIN}" alt="">${money(models.wallet.balance)}</span>`}
      </div>
      <div>
        <div class="hero" style="margin: 0 auto 14px"><img src="${character.calm}" alt="${character.name}"></div>
        <h1 class="title">Gánale al<br><span>Tío</span> Pato</h1>
        <p class="slogan">¡Rebota, gana y hazte millonario! 💰</p>
        <p class="blurb">Rebota la moneda con tu barra y junta pesos. El Tío Pato siempre te la devuelve.</p>
      </div>
      ${practice ? `
        <div class="banner">Estás en <b>Modo práctica</b>: aquí no se guardan pesos ni récords. Para competir en los marcadores y usar la tienda,
          descarga la app: <a href="${this.storeLinks.android}" target="_blank" rel="noopener">Google Play</a> · <a href="${this.storeLinks.ios}" target="_blank" rel="noopener">App Store</a></div>` : `
        <div class="quick">
          <button data-act="rewards" data-arg="streak"><b>🔥</b>Racha${dot(badges.streak)}</button>
          <button data-act="rewards" data-arg="achievements"><b>🏅</b>Logros${dot(badges.achievements)}</button>
          <button data-act="rewards" data-arg="goals"><b>🎯</b>Objetivos${dot(badges.goals)}</button>
        </div>`}
      <div class="menu-actions">
        <button class="btn dark" data-act="play">▶ Jugar</button>
        ${practice ? '' : `<div class="row"><button class="btn" data-act="shop">🛍️ Tienda</button><button class="btn" data-act="board">🏆 Marcadores</button></div>
        <button class="link" data-act="settings">⚙️ Ajustes</button>`}
      </div>`;
  }
}
