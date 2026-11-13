// Animaciones a pantalla completa: compra de cada artículo, premios en pesos, packs de power-ups y el
// revelado del personaje secreto con su cuadro VIP.
import { actions, money, esc, COIN } from './dom.js';
import { POWERUPS } from '../../../shared/catalog.js';

const CONFETTI = ['#ffc928', '#ff5a4f', '#5fe08a', '#7cc4f0', '#c29aff', '#ffffff'];

export class CelebrationView {
  #vipSent = false;

  constructor(root, { models, controllers }) {
    this.root = root;
    const { nav, profile } = controllers;
    actions(root, {
      ok: () => nav.dismissCelebration(),
      vip: async () => {
        const number = root.querySelector('#whatsapp').value.replace(/[\s-]/g, ''), consent = root.querySelector('#acepto').checked, message = root.querySelector('.msg');
        if (!/^\+[1-9]\d{7,14}$/.test(number)) { message.textContent = 'Escríbelo con código de país, por ejemplo +56912345678'; return; }
        if (!consent) { message.textContent = 'Marca la casilla para que podamos escribirte'; return; }
        if (await profile.saveVipContact(number, true)) { this.#vipSent = true; models.ui.toast = { text: '¡Listo! Te escribiremos al grupo VIP', kind: 'ok' }; nav.dismissCelebration(); }
        else message.textContent = 'No se pudo enviar. Inténtalo de nuevo';
      },
    });
    models.ui.on('celebration', (celebration) => this.render(celebration));
  }

  render(c) {
    const root = this.root;
    root.hidden = !c;
    if (!c) { root.innerHTML = ''; return; }
    root.className = `cele ${c.kind === 'secret' ? 'secret' : ''} ${c.slot ? 'slot-' + c.slot : ''}`;
    const item = c.item, grants = (list) => `<div class="grants">${Object.entries(list).map(([id, n], i) => `<div style="--i:${i}"><span>${POWERUPS[id].icon}</span><b>×${n}</b></div>`).join('')}</div>`;
    const prize = !item ? '' : c.slot === 'pad' ? `<div class="pv p-${item.id}"></div>` : c.slot === 'sfx' ? `<span class="big-ico">${item.icon}</span>` : c.slot === 'bg' ? '<span class="big-ico">🖼️</span>'
      : `<div class="${item.tier ? 'premium ' + item.tier : ''}" style="height:100%;display:grid;place-items:center"><img src="${item.img ?? item.calm}" alt=""></div>`;
    root.innerHTML = '<div class="rays"></div><div class="confetti"></div>' + ({
      purchase: () => `<div class="prize">${prize}</div><h2>¡${esc(item.name)} es ${/a$/.test(item.name.split(' ')[0]) ? 'tuya' : 'tuyo'}!</h2><p>Ya lo llevas puesto.</p><button class="btn gold" data-act="ok">¡Bacán!</button>`,
      coins: () => `<div class="prize"><img src="${COIN}" alt="" style="height:60%"></div><h2>+${money(c.amount)}</h2><p>Sumados a tus pesos.</p><button class="btn gold" data-act="ok">Cobrar</button>`,
      pack: () => `<h2>${esc(c.title)}</h2>${grants(c.grants)}<p>Úsalos en partidas Arcade.</p><button class="btn gold" data-act="ok">¡Vamos!</button>`,
      noads: () => `<div class="prize"><span class="big-ico">🚫</span></div><h2>Sin anuncios</h2><p>Ya no verás anuncios entre partidas. Gracias por apoyar el juego.</p><button class="btn gold" data-act="ok">Listo</button>`,
      secret: () => `<div class="flash"></div><div class="prize">${prize}</div>
        <h2 class="late">¡${esc(item.name)}!</h2>
        <div class="vip late"><span class="crown">👑</span><h3>Bienvenido al club VIP</h3>
          <p>Desbloqueaste el personaje secreto. Déjanos tu WhatsApp y te sumamos al grupo de los millonarios.</p>
          <input class="field-input" id="whatsapp" inputmode="tel" autocomplete="tel" placeholder="+56912345678" aria-label="Tu WhatsApp">
          <label class="check"><input type="checkbox" id="acepto"><span>Acepto que me escriban por WhatsApp para invitarme al grupo VIP.</span></label>
          <p class="msg bad"></p>
          <button class="btn gold" data-act="vip">Enviar</button><button class="link" data-act="ok">Ahora no</button></div>`,
    }[c.kind]?.() ?? '');
    if (c.kind !== 'secret') this.#confetti(c.kind === 'coins' ? COIN : null);
    else setTimeout(() => { if (!root.hidden) this.#confetti(null); }, 4000);
  }

  #confetti(image) {
    const layer = this.root.querySelector('.confetti');
    if (!layer) return;
    for (let i = 0; i < 36; i++) {
      const piece = document.createElement(image ? 'img' : 'i');
      if (image) { piece.src = image; piece.alt = ''; piece.style.width = 24 + Math.random() * 22 + 'px'; piece.style.position = 'absolute'; piece.style.top = '-60px'; piece.style.animation = 'fall linear forwards'; }
      else piece.style.background = CONFETTI[i % CONFETTI.length];
      piece.style.left = Math.random() * 96 + '%'; piece.style.animationDuration = 1.8 + Math.random() * 2.2 + 's'; piece.style.animationDelay = Math.random() * 0.9 + 's';
      layer.appendChild(piece);
    }
  }
}
