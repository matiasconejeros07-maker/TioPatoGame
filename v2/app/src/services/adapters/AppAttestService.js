// iOS · App Attest (capacitor-app-attest). La clave vive en el Secure Enclave; su id se guarda en el Keychain,
// que en iOS sobrevive a desinstalar la app: por eso el teléfono sigue siendo «el mismo» tras reinstalar.
import { AppAttest } from 'capacitor-app-attest';

/** @implements {import('../ports.js').AttestationService} */
export class AppAttestService {
  canRenew = true;

  async attest(challenge, { renew = false } = {}) {
    const { isSupported } = await AppAttest.isSupported();
    if (!isSupported) throw new Error('App Attest no está disponible en este dispositivo');   // simulador o iOS < 14
    const stored = renew ? { keyId: null } : await AppAttest.getStoredKeyId();
    if (stored.keyId) {
      // Clave ya registrada: basta con firmar el desafío.
      const { assertion } = await AppAttest.generateAssertion({ keyId: stored.keyId, payload: challenge });
      return { keyId: stored.keyId, assertion };
    }
    // Primera vez (o clave que el servidor ya no conoce): clave nueva, atestada por Apple.
    const { keyId } = await AppAttest.generateKey();
    const { attestation } = await AppAttest.attestKey({ keyId, challenge });
    await AppAttest.storeKeyId({ keyId });
    return { keyId, attestation };
  }
}
