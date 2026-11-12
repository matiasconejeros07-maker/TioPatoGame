// Caso de uso «iniciar sesión». Tres comprobaciones independientes, y solo si pasan las tres hay sesión:
//   1. el desafío es nuestro y no se ha usado          (no se puede repetir un inicio de sesión capturado)
//   2. la app y el teléfono son de fiar (atestación)   (ni emuladores, ni root/jailbreak, ni APK modificado)
//   3. la persona es quien dice (SSO de Apple / Google Play Games)
// Después, AuthRepository aplica el Device Binding y crea la sesión.
import { deriveSessionKey } from '../../../shared/signature.js';
import { b64url } from './jwt.js';
import { HttpError } from './errors.js';

/** En cada plataforma solo vale su SSO oficial. */
const PROVIDER_OF = Object.freeze({ ios: 'apple', android: 'google_play_games' });

export class AuthService {
  /**
   * @param {{ challenges: import('./stores.js').ChallengeStore, auth: import('../repositories/AuthRepository.js').AuthRepository,
   *           identityProviders: Record<string, { verify(credential: object, challenge: string): Promise<{ subject: string, refreshToken: string|null }> }>,
   *           attestors: Record<'ios'|'android', { hardwareId(payload: object): Promise<string>, verify(input: object): Promise<{ publicKey: Uint8Array|null, signCount: number }> }>,
   *           secretBox: import('./crypto.js').SecretBox, masterSecret: string }} deps
   */
  constructor(deps) { Object.assign(this, deps); }

  newChallenge() { return this.challenges.issue(); }

  async login({ platform, challenge, identity, attestation, confirmDeviceChange }) {
    if (!Object.hasOwn(PROVIDER_OF, platform ?? '') || typeof identity !== 'object' || !identity || typeof attestation !== 'object' || !attestation)
      throw new HttpError(400, 'cuerpo_invalido');
    if (!(await this.challenges.consume(challenge))) throw new HttpError(401, 'desafio_invalido');

    const attestor = this.attestors[platform];
    const hardwareId = await attestor.hardwareId(attestation);
    const device = await attestor.verify({ challenge, payload: attestation, known: await this.auth.findDevice(hardwareId) });

    const provider = PROVIDER_OF[platform];
    const who = await this.identityProviders[provider].verify(identity, challenge);

    const session = await this.auth.signIn({
      provider, subject: who.subject, refreshTokenEnc: who.refreshToken ? await this.secretBox.seal(who.refreshToken) : null,
      platform, hardwareId, publicKey: device.publicKey, signCount: device.signCount, confirmDeviceChange: confirmDeviceChange === true,
    });
    // La clave HMAC de la sesión viaja una sola vez, por TLS, y la app la guarda en el Keystore/Keychain.
    return { ...session, sessionKey: b64url(await deriveSessionKey(this.masterSecret, session.sessionId)) };
  }
}
