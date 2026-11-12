// Consentimiento de privacidad (GDPR / CCPA): se resuelve en el primer inicio, ANTES de pedir cualquier anuncio.
export class ConsentController {
  #canRequestAds = false;
  #privacyOptionsRequired = false;

  /** @param {{ consent: import('../services/ports.js').ConsentService }} deps */
  constructor({ consent }) { this.consent = consent; }

  get canRequestAds() { return this.#canRequestAds; }
  /** Si es true, Ajustes debe mostrar el botón «Opciones de privacidad». */
  get privacyOptionsRequired() { return this.#privacyOptionsRequired; }

  /** Nunca bloquea el juego: si el consentimiento falla, se juega sin anuncios. */
  async resolve() {
    try {
      const info = await this.consent.gather();
      this.#canRequestAds = info.canRequestAds;
      this.#privacyOptionsRequired = info.privacyOptionsRequired;
    } catch { this.#canRequestAds = false; }
    return this.#canRequestAds;
  }

  async openPrivacyOptions() { await this.consent.showPrivacyOptions(); return this.resolve(); }
}
