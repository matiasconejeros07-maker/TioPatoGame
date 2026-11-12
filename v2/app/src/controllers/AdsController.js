// Anuncios entre partidas: uno cada 5 partidas para todos, salvo quien compró «Sin anuncios».
// Lo llama el controlador de estados (GameFlowController) y solo él: los anuncios no se disparan desde las
// vistas ni desde la partida.
export class AdsController {
  #enabled = false;
  #ready = false;
  #loading = null;

  /**
   * @param {{ ads: import('../services/ports.js').AdsService, policy: import('../models/AdPolicyModel.js').AdPolicyModel,
   *           consent: import('./ConsentController.js').ConsentController,
   *           entitlements: import('../models/EntitlementsModel.js').EntitlementsModel }} deps
   */
  constructor({ ads, policy, consent, entitlements }) { this.ads = ads; this.policy = policy; this.consent = consent; this.entitlements = entitlements; }

  /**
   * Deja los anuncios funcionando: consentimiento (muestra el formulario si hace falta) → AdMob → primer anuncio en carga.
   * Quien compró «Sin anuncios» no ve ni el formulario. Si algo falla, se reintenta en la próxima pausa.
   */
  async start() {
    if (this.#enabled || this.entitlements.adFree) return;
    try {
      if (!(await this.consent.resolve())) return;
      await this.ads.initialize();
      this.#enabled = true;
      this.preload();
    } catch { this.#enabled = false; }
  }

  /** Deja un anuncio cargado en segundo plano (durante la partida) para que la pausa no tenga esperas. */
  preload() {
    if (!this.#enabled || this.#ready || this.#loading || this.entitlements.adFree) return;
    this.#loading = this.ads.loadInterstitial()
      .then((ok) => { this.#ready = ok; }, () => { this.#ready = false; })
      .finally(() => { this.#loading = null; });
  }

  /**
   * Al terminar una partida. @returns {Promise<boolean>} true si se mostró un anuncio.
   * Si toca anuncio y no hay uno cargado (sin señal, AdMob sin anuncios), el juego sigue y el anuncio queda
   * pendiente para la siguiente pausa: no se salta el turno.
   */
  async breakAfterMatch() {
    if (this.entitlements.adFree) return false;
    this.policy.recordMatch();
    if (!this.policy.isDue) { this.preload(); return false; }
    if (!this.#enabled) await this.start();
    if (!this.#ready) { this.preload(); return false; }
    this.#ready = false;
    let shown = true;
    try { await this.ads.showInterstitial(); this.policy.recordAdShown(); } catch { shown = false; }
    this.preload();
    return shown;
  }
}
