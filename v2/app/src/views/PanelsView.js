// Paneles simples: elegir modo, marcadores, premios (racha, logros, objetivos) y ajustes.
import { actions, money, esc } from './dom.js';
import { POWERUPS, Entitlement } from '../../../shared/catalog.js';
import { STREAK_REWARDS } from '../../../shared/store.js';
import { NAME_MAX, NAME_MIN } from '../../../shared/names.js';
import { RenameOutcome } from '../controllers/ProfileController.js';

const shell = (title, body, { tabs = '', chip = '' } = {}) => `<header><h2>${title}</h2>${chip}</header>${tabs}<div class="scroll">${body}</div><footer><button class="btn ghost" data-act="close">Volver</button></footer>`;
const tabsOf = (list, current) => `<nav class="tabs">${list.map(([id, label, dot]) => `<button data-act="tab" data-arg="${id}" class="${id === current ? 'on' : ''}">${label}${dot ? '<i class="dot"></i>' : ''}</button>`).join('')}</nav>`;

/** Jugar → elegir modo. */
export class ModeView {
  constructor(root, { models, controllers }) {
    actions(root, { close: () => controllers.nav.close(), go: (mode) => { models.ui.panel = null; controllers.flow.startMatch(mode); } });
    const render = () => {
      if (models.ui.panel !== 'mode') return;
      const stock = models.powerUps.quantities, total = Object.values(stock).reduce((a, b) => a + b, 0), best = models.leaderboard.best;
      root.innerHTML = shell('▶ Elige cómo jugar', `<div class="modes">
        <button class="mode classic" data-act="go" data-arg="classic"><h3>🏆 Clásico</h3><p>El ranking principal. Sin power-ups de pago: aquí gana el que mejor rebota.</p><em>Tu récord: ${best.classic}</em></button>
        <button class="mode arcade" data-act="go" data-arg="arcade"><h3>⚡ Arcade</h3><p>Con power-ups: activa hasta 3 por partida, 10 segundos cada uno. Tiene su propio ranking.</p>
          <em>Tu récord: ${best.arcade}</em> <em>${total ? Object.entries(POWERUPS).map(([id, p]) => `${p.icon} ${stock[id] ?? 0}`).join(' · ') : 'No tienes power-ups: consíguelos en la tienda'}</em></button>
      </div>`);
    };
    models.ui.on('panel', render);
  }
}

/** Marcadores: Clásico y Arcade. */
export class BoardView {
  constructor(root, { models, controllers }) {
    actions(root, { close: () => controllers.nav.close(), tab: (tab) => controllers.nav.showTab(tab) });
    const render = () => {
      if (models.ui.panel !== 'board') return;
      const mode = models.ui.panelTab ?? 'classic', board = models.leaderboard.boards[mode];
      const medals = ['🥇', '🥈', '🥉'], top = board?.top ?? [];
      const podium = [1, 0, 2].filter((i) => top[i]).map((i) => `<div class="p${i + 1} ${top[i].me ? 'me' : ''}"><span>${medals[i]}</span><b>${esc(top[i].name)}</b><strong>${top[i].score}</strong></div>`).join('');
      const rest = top.slice(3).map((row, i) => `<div class="rank ${row.me ? 'me' : ''}"><i>${i + 4}</i><b>${esc(row.name)}</b><strong>${row.score}</strong></div>`).join('');
      const mine = !board ? '' : board.myRank ? `Vas en el puesto <b>${board.myRank}</b> con <b>${models.leaderboard.best[mode]}</b> rebotes` : 'Todavía no apareces aquí: juega una partida en este modo';
      root.innerHTML = shell('🏆 Marcadores', `
        <p class="lead">${mode === 'classic' ? 'Partidas sin power-ups de pago. El ranking principal.' : 'Partidas con power-ups. Ranking aparte, para que el clásico sea parejo.'}</p>
        ${board ? `<div class="podium">${podium}</div>${rest}<p class="mine">${mine}</p><p class="lead" style="margin-top:12px">Demo: los rivales son de ejemplo.</p>` : '<p class="lead">Cargando…</p>'}`,
        { tabs: tabsOf([['classic', '🏆 Clásico'], ['arcade', '⚡ Arcade']], mode) });
    };
    models.ui.on('panel', render); models.leaderboard.on('change', render);
  }
}

/** Racha diaria, logros y objetivos del día. */
export class RewardsView {
  constructor(root, { models, controllers }) {
    const { nav, rewards } = controllers;
    actions(root, { close: () => nav.close(), tab: (tab) => nav.showTab(tab), claim: (arg) => rewards.claim(...arg.split(':')) });
    const list = (items, kind) => items.map((item) => `
      <div class="goal ${item.done && !item.claimed ? 'ready' : ''}"><div><b>${esc(item.label)}</b> <small>· ${money(item.reward)}</small></div>
        <div class="bar"><i style="width:${Math.round(item.progress / item.goal * 100)}%"></i></div>
        <div class="side">${item.claimed ? '<small>Cobrado ✓</small>' : item.done ? `<button class="btn small gold" data-act="claim" data-arg="${kind}:${item.id}">Cobrar</button>` : `<small>${item.progress.toLocaleString('es-CL')}/${item.goal.toLocaleString('es-CL')}</small>`}</div></div>`).join('');
    const render = () => {
      if (models.ui.panel !== 'rewards') return;
      const tab = models.ui.panelTab ?? 'streak', badges = rewards.badges, { streak } = models.rewards;
      const shown = streak.claimable ? streak.day : streak.day + 1;                     // el día que toca cobrar (hoy o mañana)
      const days = STREAK_REWARDS.map((reward, i) => { const day = i + 1, done = day < shown; return `<div class="${day === Math.min(shown, 7) ? 'today' : done ? 'done' : ''}">Día ${day}<b>${done ? '✓' : money(reward)}</b></div>`; }).join('');
      const body = tab === 'streak' ? `
          <p class="lead">Entra cada día y cobra. Si te saltas un día, la racha vuelve al día 1.</p><div class="days">${days}</div>
          ${streak.claimable ? `<button class="btn gold" data-act="claim" data-arg="streak:">Cobrar día ${streak.day} · ${money(streak.reward)}</button>` : `<p class="mine">Llevas <b>${streak.day}</b> ${streak.day === 1 ? 'día' : 'días'} seguidos. Vuelve mañana por ${money(STREAK_REWARDS[Math.min(streak.day, 6)])}.</p>`}`
        : tab === 'achievements' ? `<p class="lead">Se cobran una sola vez.</p>${list(models.rewards.achievements, 'achievement')}`
        : `<p class="lead">Tres objetivos nuevos cada día.</p>${list(models.rewards.goals, 'goal')}`;
      const scroll = root.querySelector('.scroll')?.scrollTop ?? 0;
      root.innerHTML = shell('🎁 Premios', body, { tabs: tabsOf([['streak', '🔥 Racha', badges.streak], ['achievements', '🏅 Logros', badges.achievements], ['goals', '🎯 Objetivos', badges.goals]], tab) });
      root.querySelector('.scroll').scrollTop = scroll;
    };
    models.ui.on('panel', render); models.rewards.on('change', render);
  }
}

/** Ajustes: nombre, sonido, compras, privacidad y eliminar cuenta. */
export class SettingsView {
  #editing = false; #confirming = false; #message = ''; #draft = null;

  constructor(root, { models, controllers }) {
    const { nav, audio, profile, shop, session, consent, demo } = controllers;
    const messages = {
      [RenameOutcome.INVALID]: `Usa de ${NAME_MIN} a ${NAME_MAX} letras o números`, [RenameOutcome.OFFENSIVE]: 'Ese nombre no está permitido. Prueba con otro',
      [RenameOutcome.TAKEN]: 'Ese nombre ya lo tiene otro jugador', [RenameOutcome.TOO_SOON]: 'Todavía no puedes cambiarlo', [RenameOutcome.FAILED]: 'Sin conexión. Inténtalo de nuevo',
    };
    actions(root, {
      close: () => { this.#editing = this.#confirming = false; nav.close(); },
      sound: () => audio.toggleSound(), music: () => audio.toggleMusic(),
      rename: () => { this.#editing = true; this.#message = ''; this.#draft = null; render(); root.querySelector('#nombre')?.focus(); },
      cancel: () => { this.#editing = this.#confirming = false; render(); },
      save: async () => {
        this.#draft = root.querySelector('#nombre').value;
        const outcome = await profile.rename(this.#draft);
        if (outcome === RenameOutcome.CHANGED) { this.#editing = false; models.ui.toast = { text: 'Nombre cambiado', kind: 'ok' }; } else this.#message = messages[outcome];
        render();
      },
      restore: () => shop.restorePurchases(), noads: () => nav.open('shop', 'powerups'), privacy: () => consent.openPrivacyOptions(),
      remove: () => { this.#confirming = true; render(); }, confirm: () => { this.#confirming = false; session.deleteAccount(); },
      coins: () => demo?.addCoins(100_000_000),
    });
    const render = () => {
      if (models.ui.panel !== 'settings') return;
      const { settings } = models, can = profile.canChangeName, adFree = models.entitlements.owned.includes(Entitlement.NO_ADS);
      const toggle = (act, on, label, note) => `<div class="setting"><div><b>${label}</b><small>${note}</small></div><button class="switch" role="switch" aria-checked="${on}" aria-label="${label}" data-act="${act}"></button></div>`;
      root.innerHTML = shell('⚙️ Ajustes', `
        ${this.#editing ? `<div class="form"><label for="nombre"><b>Nombre nuevo</b></label>
            <input class="field-input" id="nombre" maxlength="${NAME_MAX}" autocomplete="off" value="${esc(this.#draft ?? models.profile.displayName)}">
            <p class="msg bad">${this.#message}</p><small style="color:var(--ink-soft)">Después de cambiarlo tendrás que esperar 30 días para cambiarlo otra vez.</small>
            <div class="row"><button class="btn small ghost" style="flex:1" data-act="cancel">Cancelar</button><button class="btn small gold" style="flex:1" data-act="save">Guardar</button></div></div>`
          : `<div class="setting"><div><b>${esc(models.profile.displayName)}</b><small>${can ? 'Puedes cambiar tu nombre una vez cada 30 días' : `Podrás cambiarlo en ${profile.daysUntilNameChange} ${profile.daysUntilNameChange === 1 ? 'día' : 'días'}`}</small></div>
              <button class="btn small" data-act="rename" ${can ? '' : 'disabled'}>Cambiar</button></div>`}
        ${toggle('sound', settings.sound, 'Sonidos', 'Rebotes y efectos')}${toggle('music', settings.music, 'Música', 'La canción de fondo')}
        <div class="setting"><div><b>${adFree ? 'Sin anuncios ✓' : 'Quitar anuncios'}</b><small>${adFree ? 'Ya no verás anuncios' : 'Hoy sale un anuncio cada 5 partidas'}</small></div>${adFree ? '' : '<button class="btn small gold" data-act="noads">Ver</button>'}</div>
        <div class="setting"><div><b>Restaurar compras</b><small>Recupera «Sin anuncios» si reinstalaste el juego</small></div><button class="btn small" data-act="restore">Restaurar</button></div>
        ${consent.privacyOptionsRequired ? '<div class="setting"><div><b>Opciones de privacidad</b><small>Cambia tu decisión sobre los anuncios personalizados</small></div><button class="btn small" data-act="privacy">Abrir</button></div>' : ''}
        ${demo ? '<div class="setting"><div><b>Pesos de prueba</b><small>Solo en esta demo: suma $100.000.000 para probar la tienda completa</small></div><button class="btn small gold" data-act="coins">Sumar</button></div>' : ''}
        ${this.#confirming ? `<div class="form"><b>¿Eliminar tu cuenta?</b><small style="color:var(--ink-soft)">Se borran tus pesos, compras, racha y récords. No se puede deshacer.</small>
            <div class="row"><button class="btn small ghost" style="flex:1" data-act="cancel">No, volver</button><button class="btn small danger" style="flex:1" data-act="confirm">Sí, eliminar</button></div></div>`
          : '<div class="setting"><div><b>Eliminar cuenta</b><small>Borra tu cuenta y todos tus datos</small></div><button class="btn small danger" data-act="remove">Eliminar</button></div>'}
        <p class="lead" style="text-align:center;margin-top:16px">Gánale al Tío Pato · V2 (demo)</p>`);
    };
    for (const model of [models.settings, models.profile, models.entitlements]) model.on('change', render);
    models.ui.on('panel', render);
  }
}
