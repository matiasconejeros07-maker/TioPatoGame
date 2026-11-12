// Atestación de hardware: ¿la petición viene de NUESTRA app, sin modificar, en un teléfono real y sin root/jailbreak?
// Cada atestador devuelve además la identidad del dispositivo (`hardwareId`), base del Device Binding.
import 'reflect-metadata';                                   // lo necesita @peculiar/x509
import { decode as decodeCbor } from 'cborg';
import { X509Certificate } from '@peculiar/x509';
import { concat, equalBytes, fromBase64, sha256, sha256Hex, utf8 } from './crypto.js';
import { androidNonce } from '../../../shared/devices.js';
import { HttpError } from './errors.js';

/** El dispositivo o la app no pasaron la atestación. `reason` queda en los registros, no se le explica al cliente. */
export class UntrustedDeviceError extends HttpError {
  constructor(reason) { super(403, 'dispositivo_no_confiable', reason); }
}
const reject = (reason) => { throw new UntrustedDeviceError(reason); };

// ───────────────────────────── Android · Google Play Integrity ─────────────────────────────
const INTEGRITY_SCOPE = 'https://www.googleapis.com/auth/playintegrity';
const MAX_TOKEN_AGE_MS = 120_000;


export class PlayIntegrityAttestor {
  /** @param {{ packageName: string, account: { authorization(scope: string): Promise<string> }, fetch?: typeof fetch, now?: () => number }} config */
  constructor(config) { this.config = { fetch: (...a) => fetch(...a), now: Date.now, ...config }; }

  /** ANDROID_ID: propio de este teléfono + esta app; sobrevive a reinstalar. Lo avala el veredicto (va dentro del nonce). */
  async hardwareId({ deviceId }) {
    if (typeof deviceId !== 'string' || !/^[0-9a-f]{8,64}$/i.test(deviceId)) reject('id de dispositivo inválido');
    return 'android:' + await sha256Hex(deviceId.toLowerCase());
  }

  async verify({ challenge, payload }) {
    const { packageName, account, now } = this.config;
    if (typeof payload.integrityToken !== 'string') reject('falta el token de integridad');
    let response;
    try {
      response = await this.config.fetch(`https://playintegrity.googleapis.com/v1/${packageName}:decodeIntegrityToken`, {
        method: 'POST', headers: { authorization: await account.authorization(INTEGRITY_SCOPE), 'content-type': 'application/json' },
        body: JSON.stringify({ integrity_token: payload.integrityToken }),
      });
    } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(503, 'servicio_no_disponible'); }
    if (response.status >= 500) throw new HttpError(503, 'servicio_no_disponible');
    if (!response.ok) reject('Google no reconoce el token');

    const verdict = (await response.json()).tokenPayloadExternal ?? {};
    const request = verdict.requestDetails ?? {};
    if (request.requestPackageName !== packageName) reject('token de otra app');
    if (String(request.nonce ?? '').replace(/=+$/, '') !== await androidNonce(challenge, payload.deviceId.toLowerCase())) reject('el token no es de este intento');
    if (Math.abs(now() - Number(request.timestampMillis)) > MAX_TOKEN_AGE_MS) reject('token viejo');
    // APK modificado, reempaquetado o firmado por otro (Lucky Patcher, mods):
    if (verdict.appIntegrity?.appRecognitionVerdict !== 'PLAY_RECOGNIZED') reject('app no reconocida por Google Play');
    // emulador, root, bootloader abierto:
    if (!verdict.deviceIntegrity?.deviceRecognitionVerdict?.includes('MEETS_DEVICE_INTEGRITY')) reject('dispositivo sin integridad');
    // instalada desde fuera de Google Play:
    if (verdict.accountDetails?.appLicensingVerdict !== 'LICENSED') reject('app sin licencia de Google Play');
    return { publicKey: null, signCount: 0 };
  }
}

// ───────────────────────────── iOS · App Attest ─────────────────────────────
const NONCE_EXTENSION = '1.2.840.113635.100.8.2';
const AAGUID_PRODUCTION = concat(utf8('appattest'), new Uint8Array(7));
const AAGUID_DEVELOPMENT = utf8('appattestdevelop');

/** Firma ECDSA en formato DER (como la entrega Apple) → r‖s de 64 bytes (como la pide WebCrypto). */
function derToRaw(der) {
  const int = (offset) => { const length = der[offset + 1]; return { value: der.slice(offset + 2, offset + 2 + length), next: offset + 2 + length }; };
  const pad = (bytes) => { const trimmed = bytes.length > 32 ? bytes.slice(bytes.length - 32) : bytes; const out = new Uint8Array(32); out.set(trimmed, 32 - trimmed.length); return out; };
  if (der[0] !== 0x30) reject('firma mal formada');
  const r = int(2), s = int(r.next);
  return concat(pad(r.value), pad(s.value));
}

function parseAuthData(authData) {
  if (authData.length < 37) reject('authData corto');
  const view = new DataView(authData.buffer, authData.byteOffset, authData.byteLength);
  const parsed = { rpIdHash: authData.slice(0, 32), signCount: view.getUint32(33) };
  if (authData.length >= 55) {
    const length = view.getUint16(53);
    parsed.aaguid = authData.slice(37, 53);
    parsed.credentialId = authData.slice(55, 55 + length);
  }
  return parsed;
}

export class AppAttestAttestor {
  /**
   * @param {{ appId: string, rootCertificatePem: string, production?: boolean, now?: () => number }} config
   *   appId = «TEAMID.bundle.id» · rootCertificatePem = «Apple App Attestation Root CA» (se descarga de apple.com/certificateauthority)
   */
  constructor(config) { this.config = { now: Date.now, production: true, ...config }; }

  /** El id de la clave de App Attest: vive en el Secure Enclave del teléfono y no se puede copiar a otro. */
  async hardwareId({ keyId }) {
    if (typeof keyId !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(keyId)) reject('id de clave inválido');
    return 'ios:' + keyId;
  }

  /** @param {{ challenge: string, payload: object, known: { publicKey: Uint8Array, signCount: number } | null }} input */
  async verify({ challenge, payload, known }) {
    const clientDataHash = await sha256(challenge);
    const rpIdHash = await sha256(this.config.appId);
    try {
      return known?.publicKey
        ? await this.#verifyAssertion(payload, clientDataHash, rpIdHash, known)
        : await this.#verifyAttestation(payload, clientDataHash, rpIdHash);
    } catch (error) { if (error instanceof HttpError) throw error; reject('atestación ilegible: ' + error.message); }
  }

  /** Primera vez que se ve esta clave: Apple certifica que nació en un dispositivo real, dentro de nuestra app. */
  async #verifyAttestation({ keyId, attestation }, clientDataHash, rpIdHash) {
    if (typeof attestation !== 'string') reject('falta la atestación');
    const { fmt, attStmt, authData } = decodeCbor(fromBase64(attestation));
    if (fmt !== 'apple-appattest' || !Array.isArray(attStmt?.x5c) || attStmt.x5c.length < 2) reject('formato desconocido');

    // 1. cadena de certificados hasta la raíz de Apple
    const [leaf, intermediate] = attStmt.x5c.map((der) => new X509Certificate(der));
    const root = new X509Certificate(this.config.rootCertificatePem);
    const date = new Date(this.config.now());
    if (!(await intermediate.verify({ publicKey: root.publicKey, date })) || !(await leaf.verify({ publicKey: intermediate.publicKey, date }))) reject('certificado no emitido por Apple');
    // 2. el certificado lleva dentro el hash de (authData + desafío): es de este intento
    const extension = leaf.getExtension(NONCE_EXTENSION);
    const expectedNonce = await sha256(concat(authData, clientDataHash));
    if (!extension || !equalBytes(new Uint8Array(extension.value).slice(-32), expectedNonce)) reject('la atestación no es de este intento');
    // 3. el id de la clave es el hash de su clave pública
    const spki = new Uint8Array(leaf.publicKey.rawData);
    const keyIdBytes = fromBase64(keyId);
    if (!equalBytes(await sha256(spki.slice(-65)), keyIdBytes)) reject('la clave no coincide');
    // 4. datos del autenticador: nuestra app, clave recién creada, ambiente correcto
    const data = parseAuthData(authData);
    if (!equalBytes(data.rpIdHash, rpIdHash)) reject('atestación de otra app');
    if (data.signCount !== 0) reject('la clave ya se había usado');
    const isProduction = data.aaguid && equalBytes(data.aaguid, AAGUID_PRODUCTION);
    const isDevelopment = data.aaguid && equalBytes(data.aaguid, AAGUID_DEVELOPMENT);
    if (!(isProduction || (isDevelopment && !this.config.production))) reject('ambiente de atestación no permitido');
    if (!data.credentialId || !equalBytes(data.credentialId, keyIdBytes)) reject('credencial distinta de la clave');
    return { publicKey: spki, signCount: 0 };
  }

  /** Clave ya conocida: basta con que firme el desafío. El contador solo sube (si baja, la clave fue clonada). */
  async #verifyAssertion({ assertion }, clientDataHash, rpIdHash, known) {
    if (typeof assertion !== 'string') reject('falta la aserción');
    const { signature, authenticatorData } = decodeCbor(fromBase64(assertion));
    const key = await crypto.subtle.importKey('spki', known.publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const nonce = await sha256(concat(authenticatorData, clientDataHash));
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(signature), nonce))) reject('firma del dispositivo inválida');
    const data = parseAuthData(authenticatorData);
    if (!equalBytes(data.rpIdHash, rpIdHash)) reject('aserción de otra app');
    if (data.signCount <= known.signCount) reject('contador repetido');
    return { publicKey: known.publicKey, signCount: data.signCount };
  }
}
