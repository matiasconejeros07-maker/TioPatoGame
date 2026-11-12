// Android · Play Integrity (@capacitor-community/play-integrity). Google certifica que es nuestra app, sin modificar,
// instalada desde Play, en un teléfono real y sin root. El id del teléfono (ANDROID_ID) va dentro del nonce.
import { Device } from '@capacitor/device';
import { CapacitorPlayIntegrity } from '@capacitor-community/play-integrity';
import { androidNonce } from '../../../../shared/devices.js';

/** @implements {import('../ports.js').AttestationService} */
export class PlayIntegrityService {
  canRenew = false;
  /** @param {{ cloudProjectNumber: number }} config  número del proyecto de Google Cloud enlazado en Play Console → Integridad de la app */
  constructor(config) { this.config = config; }

  async attest(challenge) {
    const deviceId = (await Device.getId()).identifier.toLowerCase();
    const { token } = await CapacitorPlayIntegrity.requestIntegrityToken({
      nonce: await androidNonce(challenge, deviceId), googleCloudProjectNumber: this.config.cloudProjectNumber });
    return { integrityToken: token, deviceId };
  }
}
