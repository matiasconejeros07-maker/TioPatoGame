// Abre y cierra los paneles (tienda, marcadores, ajustes, premios) y los avisos. Las vistas solo le avisan de los toques.
export class NavigationController {
  #toastTimer = null;

  /**
   * @param {{ ui: import('../models/UiModel.js').UiModel, audio: import('./AudioController.js').AudioController,
   *           leaderboards?: { refresh(): Promise<unknown> }, rewards?: { refresh(): Promise<unknown> } }} deps
   */
  constructor({ ui, audio, leaderboards, rewards }) {
    Object.assign(this, { ui, audio, leaderboards, rewards });
    ui.on('toast', (toast) => { clearTimeout(this.#toastTimer); if (toast) this.#toastTimer = setTimeout(() => { ui.toast = null; }, 2600); });
  }

  open(panel, tab = null) {
    this.audio.unlock(); this.audio.play('tap');
    this.ui.panelTab = tab;
    this.ui.panel = panel;
    if (panel === 'board') this.leaderboards?.refresh();
    if (panel === 'rewards') this.rewards?.refresh();
  }
  showTab(tab) { this.audio.play('tap'); this.ui.panelTab = tab; }
  close() { this.audio.play('tap'); this.ui.panel = null; }
  dismissCelebration() { this.ui.celebration = null; }
}
