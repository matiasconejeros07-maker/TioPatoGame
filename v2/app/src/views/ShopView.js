// Tienda. Pestañas: Power-Ups (packs de oferta), Personajes, Pelotas, Barras, Fondos y Sonidos.
import { actions, money, COIN, esc } from './dom.js';
import { SHOP } from '../../../shared/store.js';
import { POWERUPS } from '../../../shared/catalog.js';

const TABS = [['powerups', '⚡ Power-Ups'], ['ch', 'Personajes'], ['ball', 'Pelotas'], ['pad', 'Barras'], ['bg', 'Fondos'], ['sfx', 'Sonidos']];
const PACK_ICONS = ['🫧', '❄️', '⚡', '👑'];
const BG_SWATCH = {
  clasico: 'linear-gradient(180deg, #003454, #4a3aa8 60%, #c2312f)', atardecer: 'linear-gradient(180deg, #2b1a5e, #b0407a 45%, #ff8a5c 70%, #1a4a7a 72%)',
  aurora: 'url(fondos/aurora-1.webp)', galaxia: 'url(fondos/galaxia-1.webp)', synth: 'linear-gradient(180deg, #14022e, #3d0a6b 50%, #ff5fa2 52%, #0a0118)',
};

export class ShopView {
  #offers = null;

  constructor(root, { models, controllers }) {
    this.root = root; this.models = models; this.controllers = controllers;
    const { shop, nav, audio, purchases } = controllers;
    actions(root, {
      close: () => nav.close(), tab: (tab) => nav.showTab(tab),
      buy: (arg) => shop.buy(...arg.split(':')), equip: (arg) => shop.equip(...arg.split(':')),
      listen: (id) => audio.preview(id),
      coins: (id) => shop.buyPowerUpWithCoins(id),
      money: (productId) => { const offer = [...this.#offers.packs, ...this.#offers.permanent].find((o) => o.productId === productId); if (offer) shop.buyWithMoney(offer).then(() => this.#loadOffers()); },
    });
    for (const model of [models.wallet, models.inventory, models.powerUps, models.entitlements]) model.on('change', () => this.render());
    models.ui.on('panel', (panel) => { if (panel === 'shop') { if (!this.#offers) this.#loadOffers(); this.render(); } });
    this.purchases = purchases;
  }

  async #loadOffers() { try { this.#offers = await this.purchases.offers(); } catch { this.#offers = { packs: [], permanent: [] }; } this.render(); }

  render() {
    const { models } = this;
    if (models.ui.panel !== 'shop') return;
    const tab = models.ui.panelTab ?? 'powerups';
    const scroll = this.root.querySelector('.scroll')?.scrollTop ?? 0, sameTab = this.root.dataset.tab === tab;
    this.root.dataset.tab = tab;
    this.root.innerHTML = `
      <header><h2>🛍️ Tienda</h2><span class="chip"><img src="${COIN}" alt="">${money(models.wallet.balance)}</span></header>
      <nav class="tabs">${TABS.map(([id, label]) => `<button data-act="tab" data-arg="${id}" class="${id === tab ? 'on' : ''}">${label}</button>`).join('')}</nav>
      <div class="scroll">${tab === 'powerups' ? this.#powerUps() : tab === 'sfx' ? this.#sounds() : this.#items(tab)}</div>
      <footer><button class="btn ghost" data-act="close">Volver</button></footer>`;
    if (sameTab) this.root.querySelector('.scroll').scrollTop = scroll;
  }

  #button(slot, item) {
    const { shop } = this.controllers, arg = `${slot}:${item.id}`;
    if (shop.isEquipped(slot, item.id)) return '<button class="btn is" disabled>Equipado ✓</button>';
    if (shop.owns(slot, item.id)) return `<button class="btn" data-act="equip" data-arg="${arg}">Equipar</button>`;
    return `<button class="btn ${shop.canAfford(item.price) ? 'can' : ''}" data-act="buy" data-arg="${arg}"><img src="${COIN}" alt="">${money(item.price)}</button>`;
  }

  #items(slot) {
    const { shop } = this.controllers;
    const picture = (item) => (slot === 'pad' ? `<div class="pic dark"><div class="pv p-${item.id}"></div></div>`
      : slot === 'bg' ? `<div class="pic"><div class="swatch" style="background-image:${BG_SWATCH[item.id]}"></div></div>`
      : slot === 'ball' ? `<div class="pic dark"><div class="${item.tier ? 'premium ' + item.tier : ''}" style="width:${item.fx === 'spin' ? 64 : 96}px"><img src="${item.img}" alt="" style="max-width:100%;max-height:none"></div></div>`
      : `<div class="pic"><img src="${item.calm}" alt=""></div>`);
    const note = (item) => (slot === 'ball' ? `Paga ${money(item.rate)} por punto` : item.note);
    const cards = SHOP[slot].map((item) => {
      const hidden = item.secret && !shop.owns(slot, item.id);
      return `<article class="item ${shop.isEquipped(slot, item.id) ? 'equipped' : ''} ${hidden ? 'mystery' : ''}">${picture(item)}
        <b>${hidden ? 'Personaje secreto' : esc(item.name)}</b><p>${hidden ? 'Solo para millonarios. ¿Quién será?' : esc(note(item))}</p>${this.#button(slot, item)}</article>`;
    }).join('');
    const lead = { ch: 'Tu rival en la cancha. Todos se enojan cuando avanzas.', ball: 'Cada pelota paga distinto por punto: mientras más vale, más ganas.', pad: 'Tu barra. Solo cambia cómo se ve.', bg: 'El fondo de la cancha.' }[slot];
    return `<p class="lead">${lead}</p><div class="grid">${cards}</div>`;
  }

  #sounds() {
    const { shop } = this.controllers;
    return `<p class="lead">El sonido de cada rebote. Toca ▶ para escucharlo antes de comprar.</p>` + SHOP.sfx.map((item) => `
      <div class="sound-row ${shop.isEquipped('sfx', item.id) ? 'equipped' : ''}">
        <button class="play" data-act="listen" data-arg="${item.id}" aria-label="Escuchar ${esc(item.name)}">▶</button>
        <span class="ico">${item.icon}</span><div><b>${esc(item.name)}</b><small>${esc(item.note)}</small></div>
        <div class="item" style="padding:0;background:none;box-shadow:none;flex:none">${this.#button('sfx', item)}</div>
      </div>`).join('');
  }

  #powerUps() {
    const { models, controllers: { shop } } = this, stock = models.powerUps.quantities, offers = this.#offers;
    const grants = (list) => Object.entries(list).map(([id, n]) => `<li>${POWERUPS[id].icon} ×${n}</li>`).join('');
    return `
      <p class="lead">Se usan en partidas <b>Arcade</b>: duran 10 segundos y puedes activar hasta 3 por partida. En <b>Clásico</b> no se pueden usar.</p>
      <div class="stock">${Object.entries(POWERUPS).map(([id, p]) => `
        <div><span>${p.icon}</span><b>${stock[id] ?? 0}</b><small>${p.name}</small>
          <button class="btn small ${shop.canAfford(shop.powerUpCoinPrice) ? 'gold' : ''}" data-act="coins" data-arg="${id}">${money(shop.powerUpCoinPrice)}</button></div>`).join('')}</div>
      <h3 class="section">🎁 Packs de ofertas</h3>
      ${!offers ? '<p class="lead">Cargando ofertas…</p>' : offers.packs.map((offer, i) => `
        <article class="pack pack-${i + 1}">${i === 2 ? '<span class="ribbon">Más vendido</span>' : i === 3 ? '<span class="ribbon">Mejor precio</span>' : ''}
          <div class="emblem"><span>${PACK_ICONS[i]}</span><i>×${Object.values(offer.grants).reduce((a, b) => a + b, 0)}</i></div>
          <div><h3>${esc(offer.name)}</h3><ul>${grants(offer.grants)}</ul>
            <button class="btn small gold" data-act="money" data-arg="${offer.productId}">Comprar · ${offer.priceLabel}</button></div>
        </article>`).join('') + offers.permanent.map((offer) => `
        <article class="pack pack-noads"><div class="emblem"><span>🚫</span></div>
          <div><h3>${esc(offer.name)}</h3><ul><li>Para siempre</li><li>Una sola compra</li></ul>
            <button class="btn small gold" data-act="money" data-arg="${offer.productId}">Comprar · ${offer.priceLabel}</button></div>
        </article>`).join('')}`;
  }
}
