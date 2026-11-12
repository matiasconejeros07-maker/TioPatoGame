// Datos de la política de anuncios. Cuándo toca uno lo decide AdsController.
import { AD_EVERY_MATCHES } from '../../../shared/catalog.js';

export class AdPolicyModel {
  #everyMatches = AD_EVERY_MATCHES;
  #matchesSinceAd = 0;

  /** Cada cuántas partidas sale un anuncio. */
  get everyMatches() { return this.#everyMatches; }
  set everyMatches(value) { this.#everyMatches = value; }

  /** Partidas jugadas desde el último anuncio mostrado. */
  get matchesSinceAd() { return this.#matchesSinceAd; }
  set matchesSinceAd(value) { this.#matchesSinceAd = value; }
}
