// Adaptador de Google AdMob (@capacitor-community/admob): anuncios y consentimiento (UMP).
import { AdMob, InterstitialAdPluginEvents, PrivacyOptionsRequirementStatus } from '@capacitor-community/admob';

/** @implements {import('../ports.js').ConsentService} */
export class AdMobConsentService {
  async gather() {
    let info = await AdMob.requestConsentInfo();
    if (!info.canRequestAds && info.isConsentFormAvailable) info = await AdMob.showConsentForm();
    return { canRequestAds: info.canRequestAds, privacyOptionsRequired: info.privacyOptionsRequirementStatus === PrivacyOptionsRequirementStatus.REQUIRED };
  }
  async showPrivacyOptions() { await AdMob.showPrivacyOptionsForm(); }
}

/** @implements {import('../ports.js').AdsService} */
export class AdMobAdsService {
  /** @param {{ interstitialId: string, testing?: boolean }} config  id del bloque de anuncios de esta plataforma */
  constructor(config) { this.config = config; }

  async initialize() { await AdMob.initialize({ initializeForTesting: Boolean(this.config.testing) }); }

  async loadInterstitial() {
    try { await AdMob.prepareInterstitial({ adId: this.config.interstitialId, isTesting: Boolean(this.config.testing) }); return true; }
    catch { return false; }
  }

  async showInterstitial() {
    const handles = [];
    try {
      await new Promise((resolve, reject) => {
        handles.push(AdMob.addListener(InterstitialAdPluginEvents.Dismissed, resolve));
        handles.push(AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, reject));
        AdMob.showInterstitial().catch(reject);
      });
    } finally { for (const handle of handles) (await handle).remove(); }
  }
}
