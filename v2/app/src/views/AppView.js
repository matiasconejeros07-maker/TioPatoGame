// Vista raíz: arma las pantallas y muestra la que corresponde al estado del juego. No decide nada.
import { GameState } from '../models/GameFlowModel.js';
import { MenuView } from './MenuView.js';
import { MatchView } from './MatchView.js';
import { GameOverView } from './GameOverView.js';
import { ShopView } from './ShopView.js';
import { ModeView, BoardView, RewardsView, SettingsView } from './PanelsView.js';
import { CelebrationView } from './CelebrationView.js';

const SCREEN_OF = { [GameState.MENU]: 'menu', [GameState.PLAYING]: 'game', [GameState.GAME_OVER]: 'over', [GameState.AD_BREAK]: 'over', [GameState.BOOT]: 'menu', [GameState.CONSENT]: 'menu' };

export class AppView {
  constructor(root, game) {
    const { models, controllers } = game, full = !models.session.practice;
    root.innerHTML = `
      <section class="screen menu"></section><section class="screen game" hidden></section><section class="screen over" hidden></section>
      ${full ? ['mode', 'shop', 'board', 'rewards', 'settings'].map((p) => `<section class="panel" data-panel="${p}" hidden></section>`).join('') + '<div class="cele" hidden></div>' : ''}
      <div class="toast" hidden role="status"></div>`;
    const screen = (name) => root.querySelector('.screen.' + name), panel = (name) => root.querySelector(`[data-panel="${name}"]`);
    new MenuView(screen('menu'), game);
    const match = new MatchView(screen('game'), game);
    new GameOverView(screen('over'), game);
    if (full) {
      new ModeView(panel('mode'), game); new ShopView(panel('shop'), game); new BoardView(panel('board'), game);
      new RewardsView(panel('rewards'), game); new SettingsView(panel('settings'), game); new CelebrationView(root.querySelector('.cele'), game);
      models.ui.on('panel', (open) => { for (const el of root.querySelectorAll('.panel')) el.hidden = el.dataset.panel !== open; });
      const toast = root.querySelector('.toast');
      models.ui.on('toast', (t) => { toast.hidden = !t; if (t) { toast.textContent = t.text; toast.className = 'toast ' + (t.kind === 'warn' ? 'warn' : ''); } });
    }
    const show = () => {
      const current = SCREEN_OF[models.flow.state];
      for (const name of ['menu', 'game', 'over']) screen(name).hidden = name !== current;
      if (current === 'game') match.measure();
    };
    models.flow.on('change', show);
    show();
    // el primer toque desbloquea el audio (los navegadores no dejan sonar antes)
    root.addEventListener('pointerdown', () => controllers.audio.unlock(), { once: true });
  }
}
