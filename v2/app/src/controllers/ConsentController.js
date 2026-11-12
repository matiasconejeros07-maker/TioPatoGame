// Consentimiento de privacidad (GDPR / CCPA): se resuelve ANTES de pedir cualquier anuncio.
// Ojo: «resuelto» no significa «aceptado». Cuando el jugador responde el formulario (acepte o rechace),
// ya se pueden pedir anuncios; si rechazó, Google los entrega sin personalizar. Lo único que no se puede
// hacer es pedir anuncios antes de que haya respondido donde la ley exige preguntar.
export class ConsentController {
  #canRequestAds = false;
  #privacyOptionsRequired = false;

  /** @param {{ consent: import('../services/ports.js').ConsentService }} deps */
  constructor({ consent }) { this.consent = consent; }

  get canRequestAds() { return this.#canRequestAds; }
  /** Si es true, Ajustes debe mostrar el botón «Opciones de privacidad». */
  get privacyOptionsRequired() { return this.#privacyOptionsRequired; }

  /** Nunca bloquea el juego: si falla (p. ej. sin internet), se vuelve a intentar en la próxima pausa de anuncios. */
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
