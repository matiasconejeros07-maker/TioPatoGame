// Cuándo corresponde mostrar un interstitial. Solo decide; no sabe nada de AdMob.
// La idea es que el anuncio se sienta como una pausa natural y no como un castigo.

export const DEFAULT_AD_POLICY = Object.freeze({
  graceMatches: 2,            // las primeras partidas de la sesión van sin anuncios
  everyMatches: 3,            // después, como mucho un anuncio cada 3 partidas…
  minIntervalMs: 150_000,     // …y nunca dos en menos de 2,5 minutos
  minMatchMs: 12_000,         // no después de una partida que duró un suspiro (ya es frustrante perder al tiro)
});

export class AdPolicyModel {
  #matches = 0;
  #matchesSinceAd = 0;
  #lastAdAt = -Infinity;

  constructor(policy = DEFAULT_AD_POLICY) { this.policy = policy; }

  recordMatch() { this.#matches++; this.#matchesSinceAd++; }
  recordAdShown(now) { this.#matchesSinceAd = 0; this.#lastAdAt = now; }

  /** @param {{ now: number, lastMatchMs: number }} context */
  shouldShow({ now, lastMatchMs }) {
    const p = this.policy;
    return this.#matches > p.graceMatches
      && this.#matchesSinceAd >= p.everyMatches
      && now - this.#lastAdAt >= p.minIntervalMs
      && lastMatchMs >= p.minMatchMs;
  }
}
