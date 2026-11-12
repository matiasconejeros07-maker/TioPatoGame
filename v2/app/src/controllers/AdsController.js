// Anuncios entre partidas. Lo llama el controlador de estados (GameFlowController) y solo él: los anuncios
// no se disparan desde las vistas ni desde la partida.
export class AdsController {
  #enabled = false;
  #ready = false;
  #loading = null;

  /**
   * @param {{ ads: import('../services/ports.js').AdsService, policy: import('../models/AdPolicyModel.js').AdPolicyModel,
   *           now?: () => number }} deps
   */
  constructor({ ads, policy, now = Date.now }) { this.ads = ads; this.policy = policy; this.now = now; }

  /** Solo después de tener el consentimiento. Sin él, este controlador no hace nada. */
  async enable() {
    try { await this.ads.initialize(); this.#enabled = true; this.preload(); } catch { this.#enabled = false; }
  }

  /** Deja un anuncio cargado en segundo plano (durante la partida) para que la pausa no tenga esperas. */
  preload() {
    if (!this.#enabled || this.#ready || this.#loading) return;
    this.#loading = this.ads.loadInterstitial()
      .then((ok) => { this.#ready = ok; }, () => { this.#ready = false; })
      .finally(() => { this.#loading = null; });
  }

  /**
   * Al terminar una partida. Muestra el anuncio solo si la política lo permite y ya está cargado
   * (nunca hace esperar al jugador por un anuncio). @returns {Promise<boolean>} true si se mostró
   */
  async breakAfterMatch(lastMatchMs) {
    this.policy.recordMatch();
    if (!this.#enabled || !this.#ready || !this.policy.shouldShow({ now: this.now(), lastMatchMs })) { this.preload(); return false; }
    this.#ready = false;
    let shown = true;
    try { await this.ads.showInterstitial(); this.policy.recordAdShown(this.now()); } catch { shown = false; }
    this.preload();
    return shown;
  }
}
