// Cuándo corresponde mostrar un interstitial: uno cada 5 partidas. Solo decide; no sabe nada de AdMob.
import { AD_EVERY_MATCHES } from '../../../shared/catalog.js';

export class AdPolicyModel {
  #matchesSinceAd = 0;

  constructor(everyMatches = AD_EVERY_MATCHES) { this.everyMatches = everyMatches; }

  recordMatch() { this.#matchesSinceAd++; }
  recordAdShown() { this.#matchesSinceAd = 0; }

  /** Si el anuncio no se pudo mostrar cuando tocaba, sigue «debiéndose»: sale en la siguiente pausa en que se pueda. */
  get isDue() { return this.#matchesSinceAd >= this.everyMatches; }
}
