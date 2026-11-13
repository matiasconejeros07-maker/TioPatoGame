// Inicio de sesión: SSO oficial (Apple / Play Games) + atestación del teléfono + Device Binding.
// La app solo junta las pruebas y las manda; quien decide es el servidor.
import { ApiError } from '../services/ApiClient.js';

export const SignInOutcome = Object.freeze({
  SIGNED_IN: 'signed_in',
  CANCELLED: 'cancelled',                         // cerró el diálogo de Apple / Play Games
  CONFIRM_DEVICE_CHANGE: 'confirm_device_change', // la cuenta está en otro teléfono: hay que avisar y pedir confirmación
  DEVICE_CHANGE_WAIT: 'device_change_wait',       // ya cambió de teléfono hace menos de 30 días
  DEVICE_HAS_ACCOUNT: 'device_has_account',       // este teléfono ya tiene otra cuenta
  UNTRUSTED_DEVICE: 'untrusted_device',           // root/jailbreak, emulador o app modificada
  FAILED: 'failed',                               // sin conexión u otro error: se puede reintentar
});

const OUTCOME_OF = Object.freeze({
  confirmar_cambio_de_dispositivo: SignInOutcome.CONFIRM_DEVICE_CHANGE,
  cambio_de_dispositivo_en_espera: SignInOutcome.DEVICE_CHANGE_WAIT,
  dispositivo_con_otra_cuenta: SignInOutcome.DEVICE_HAS_ACCOUNT,
  dispositivo_no_confiable: SignInOutcome.UNTRUSTED_DEVICE,
});

const fromBase64Url = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export class AuthController {
  /**
   * @param {{ api: { open(path: string, data?: object): Promise<any>, request: Function }, platform: 'ios'|'android',
   *           identity: import('../services/ports.js').IdentityService, attestation: import('../services/ports.js').AttestationService,
   *           sessionStore: import('../services/ports.js').SessionStore, legacyAuth: import('../services/ports.js').LegacyAuthService,
   *           session: import('../models/SessionModel.js').SessionModel, profile: import('../models/ProfileModel.js').ProfileModel }} deps
   */
  constructor(deps) { Object.assign(this, deps); }

  get signedIn() { return this.session.current !== null; }

  /** Al abrir la app: recupera la sesión guardada en el Keystore/Keychain, si hay. */
  async restore() {
    const saved = await this.sessionStore.load().catch(() => null);
    if (saved) this.session.current = saved;
    return this.signedIn;
  }

  /**
   * @param {{ confirmDeviceChange?: boolean }} [options]  true solo después de que el jugador aceptó mover su cuenta a este teléfono
   * @returns {Promise<{ outcome: string, isNew?: boolean, hasLegacyAccount?: boolean, nextChangeAt?: string }>}
   */
  async signIn({ confirmDeviceChange = false } = {}) {
    try {
      let result;
      try { result = await this.#attempt(confirmDeviceChange, false); }
      catch (error) {
        // iOS: el servidor no conoce la clave guardada (p. ej. la cuenta se eliminó). Se crea una clave nueva y se reintenta una vez.
        if (!(error instanceof ApiError) || error.code !== 'dispositivo_no_confiable' || !this.attestation.canRenew) throw error;
        result = await this.#attempt(confirmDeviceChange, true);
      }
      const session = { id: result.sessionId, key: fromBase64Url(result.sessionKey), userId: result.userId };
      await this.sessionStore.save(session);
      this.session.current = session;
      this.profile.displayName = result.displayName;
      this.profile.nextNameChangeAt = result.nextNameChangeAt ? new Date(result.nextNameChangeAt) : null;
      return { outcome: SignInOutcome.SIGNED_IN, isNew: result.isNew, hasLegacyAccount: result.hasLegacyAccount };
    } catch (error) {
      if (error?.cancelled) return { outcome: SignInOutcome.CANCELLED };
      if (error instanceof ApiError && OUTCOME_OF[error.code]) return { outcome: OUTCOME_OF[error.code], nextChangeAt: error.details.nextChangeAt };
      return { outcome: SignInOutcome.FAILED };
    }
  }

  async #attempt(confirmDeviceChange, renewKey) {
    // Cada intento usa un desafío nuevo del servidor: el SSO y la atestación quedan atados a él.
    const { challenge } = await this.api.open('/auth/challenge');
    const attestation = await this.attestation.attest(challenge, { renew: renewKey });
    const identity = await this.identity.signIn(challenge);
    return this.api.open('/auth/login', { platform: this.platform, challenge, identity, attestation, confirmDeviceChange });
  }

  /**
   * «Ya tenía cuenta»: recupera la cuenta de la V1 con el nombre (o correo) y la contraseña de siempre.
   * @returns {Promise<'linked'|'wrong_password'|'not_found'|'already_linked'|'failed'>}
   */
  async linkLegacyAccount(login, password) {
    let firebaseIdToken;
    try { firebaseIdToken = await this.legacyAuth.signIn(login, password); } catch { return 'wrong_password'; }
    try {
      const { userId } = await this.api.request('POST', '/account/link-legacy', { firebaseIdToken });
      const session = { ...this.session.current, userId };
      await this.sessionStore.save(session);
      this.session.current = session;
      return 'linked';
    } catch (error) {
      return { 404: 'not_found', 409: 'already_linked' }[error instanceof ApiError ? error.status : 0] ?? 'failed';
    }
  }

  /** Ajustes → «Eliminar cuenta»: borra la cuenta en el servidor y cierra la sesión. @returns {Promise<boolean>} */
  async deleteAccount() {
    try { await this.api.request('DELETE', '/account'); } catch { return false; }
    await this.signOut();
    return true;
  }

  async signOut() { await this.sessionStore.clear().catch(() => {}); this.session.current = null; }
}
