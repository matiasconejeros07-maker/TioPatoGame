// Anuncios entre partidas: uno cada 5 partidas para todos, salvo quien compró «Sin anuncios».
// Lo llama el controlador de estados (GameFlowController) y solo él: los anuncios no se disparan desde las
// vistas ni desde la partida.
import { Entitlement } from '../../../shared/catalog.js';

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

  get adFree() { return this.entitlements.owned.includes(Entitlement.NO_ADS); }

  /** ¿Toca anuncio? Si no se pudo mostrar cuando tocaba, sigue «debiéndose» hasta la próxima pausa en que se pueda. */
  get isDue() { return this.policy.matchesSinceAd >= this.policy.everyMatches; }

  /**
   * Deja los anuncios funcionando: consentimiento (muestra el formulario si hace falta) → AdMob → primer anuncio en carga.
   * Quien compró «Sin anuncios» no ve ni el formulario. Si algo falla, se reintenta en la próxima pausa.
   */
  async start() {
    if (this.#enabled || this.adFree) return;
    try {
      if (!(await this.consent.resolve())) return;
      await this.ads.initialize();
      this.#enabled = true;
      this.preload();
    } catch { this.#enabled = false; }
  }

  /** Deja un anuncio cargado en segundo plano (durante la partida) para que la pausa no tenga esperas. */
  preload() {
    if (!this.#enabled || this.#ready || this.#loading || this.adFree) return;
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
    if (this.adFree) return false;
    this.policy.matchesSinceAd += 1;
    if (!this.isDue) { this.preload(); return false; }
    if (!this.#enabled) await this.start();
    if (!this.#ready) { this.preload(); return false; }
    this.#ready = false;
    let shown = true;
    try { await this.ads.showInterstitial(); this.policy.matchesSinceAd = 0; } catch { shown = false; }
    this.preload();
    return shown;
  }
}
