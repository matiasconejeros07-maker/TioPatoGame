// Los verificadores reales de atestación y SSO. No hay teléfonos ni servidores de Apple/Google aquí:
// se fabrican certificados, firmas y respuestas con claves generadas en la prueba, para comprobar que cada
// verificador acepta lo legítimo y rechaza cada manera de hacer trampa.
import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import * as x509 from '@peculiar/x509';
import { encode as cbor } from 'cborg';
import { AppAttestAttestor, PlayIntegrityAttestor, UntrustedDeviceError } from '../src/services/attestors.js';
import { androidNonce } from '../../shared/devices.js';
import { AppleIdentityProvider, PlayGamesIdentityProvider } from '../src/services/identityProviders.js';
import { concat, sha256, sha256Hex, utf8 } from '../src/services/crypto.js';
import { decodeJwt, signJwt } from '../src/services/jwt.js';
import { HttpError } from '../src/services/errors.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const untrusted = (reason) => (e) => e instanceof UntrustedDeviceError && e.status === 403 && (!reason || e.message.includes(reason));
const CHALLENGE = 'desafio-de-prueba-0123456789abcdefghijklmnopq';
const NOW = Date.parse('2026-11-12T12:00:00Z');

// ───────────────────────────── Android · Play Integrity ─────────────────────────────
const PACKAGE = 'com.miempresa.pingpong', DEVICE = 'a1b2c3d4e5f60718';

async function integrity(over = {}, { status = 200, deviceId = DEVICE } = {}) {
  const calls = [];
  const good = {
    requestDetails: { requestPackageName: PACKAGE, nonce: await androidNonce(CHALLENGE, DEVICE), timestampMillis: String(NOW - 5000) },
    appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED' },
    deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
    accountDetails: { appLicensingVerdict: 'LICENSED' },
  };
  const attestor = new PlayIntegrityAttestor({
    packageName: PACKAGE, now: () => NOW, account: { async authorization(scope) { calls.push(scope); return 'Bearer acceso'; } },
    fetch: async (url, init) => { calls.push({ url, init }); return json({ tokenPayloadExternal: { ...good, ...over } }, status); },
  });
  const payload = { integrityToken: 'token-cifrado-de-google', deviceId };
  return { calls, run: () => attestor.verify({ challenge: CHALLENGE, payload, known: null }), attestor, payload };
}

test('Play Integrity: acepta app original en teléfono íntegro y le pide el veredicto a Google', async () => {
  const { calls, run, attestor, payload } = await integrity();
  assert.deepEqual(await run(), { publicKey: null, signCount: 0 });
  assert.equal(calls[0], 'https://www.googleapis.com/auth/playintegrity');
  assert.equal(calls[1].url, `https://playintegrity.googleapis.com/v1/${PACKAGE}:decodeIntegrityToken`);
  assert.deepEqual(JSON.parse(calls[1].init.body), { integrity_token: 'token-cifrado-de-google' });
  assert.equal(await attestor.hardwareId(payload), 'android:' + await sha256Hex(DEVICE));
  assert.equal(await attestor.hardwareId({ deviceId: DEVICE.toUpperCase() }), await attestor.hardwareId(payload), 'mismo teléfono, mismo id');
});

test('Play Integrity: rechaza APK modificado, emulador/root, instalación fuera de Play, token ajeno, viejo o de otro teléfono', async () => {
  const cases = {
    'app no reconocida': { appIntegrity: { appRecognitionVerdict: 'UNRECOGNIZED_VERSION' } },                // APK parchado o reempaquetado
    'dispositivo sin integridad': { deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_VIRTUAL_INTEGRITY'] } }, // emulador
    'sin integridad': { deviceIntegrity: {} },                                                                // root / bootloader abierto
    'sin licencia': { accountDetails: { appLicensingVerdict: 'UNLICENSED' } },                                // APK instalado a mano
    'otra app': { requestDetails: { requestPackageName: 'otra.app', nonce: await androidNonce(CHALLENGE, DEVICE), timestampMillis: String(NOW) } },
    'este intento': { requestDetails: { requestPackageName: PACKAGE, nonce: await androidNonce('otro-desafio', DEVICE), timestampMillis: String(NOW) } },
    'token viejo': { requestDetails: { requestPackageName: PACKAGE, nonce: await androidNonce(CHALLENGE, DEVICE), timestampMillis: String(NOW - 10 * 60_000) } },
  };
  for (const [reason, over] of Object.entries(cases)) await assert.rejects((await integrity(over)).run(), untrusted(reason), reason);
  // el veredicto es bueno pero de OTRO teléfono: quien lo roba y cambia el id del dispositivo no pasa
  await assert.rejects((await integrity({}, { deviceId: 'ffffffffffffffff' })).run(), untrusted('este intento'));
  await assert.rejects((await integrity({}, { status: 400 })).run(), untrusted('no reconoce'));
  await assert.rejects((await integrity({}, { status: 503 })).run(), (e) => e instanceof HttpError && e.status === 503);
  await assert.rejects((await integrity()).attestor.hardwareId({ deviceId: '../x' }), untrusted());
});

// ───────────────────────────── iOS · App Attest ─────────────────────────────
const EC = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
const APP = 'ABCDE12345.com.miempresa.pingpong';
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const newKeys = () => crypto.subtle.generateKey(EC, true, ['sign', 'verify']);
const validity = { notBefore: new Date(NOW - 86_400_000), notAfter: new Date(NOW + 86_400_000) };

/** Una «Apple» de mentira: raíz e intermedia propias. */
async function fakeApple() {
  const rootKeys = await newKeys(), interKeys = await newKeys();
  const root = await x509.X509CertificateGenerator.createSelfSigned({ serialNumber: '01', name: 'CN=Raiz de prueba', ...validity, signingAlgorithm: EC, keys: rootKeys });
  const inter = await x509.X509CertificateGenerator.create({ serialNumber: '02', subject: 'CN=Intermedia', issuer: root.subject, ...validity, signingAlgorithm: EC, publicKey: interKeys.publicKey, signingKey: rootKeys.privateKey });
  return { rootPem: root.toString('pem'), inter, interKeys };
}

/** Lo que haría un iPhone: crea una clave, pide su atestación y después firma aserciones. */
async function fakeIphone(apple, { appId = APP, aaguid = 'appattest\0\0\0\0\0\0\0', challenge = CHALLENGE, signCount = 0 } = {}) {
  const deviceKeys = await newKeys();
  const point = new Uint8Array(await crypto.subtle.exportKey('raw', deviceKeys.publicKey));
  const keyIdBytes = await sha256(point);
  const authData = concat(await sha256(appId), Uint8Array.of(0x40), Uint8Array.of(0, 0, 0, signCount), utf8(aaguid), Uint8Array.of(0, 32), keyIdBytes);
  const nonce = await sha256(concat(authData, await sha256(challenge)));
  const leaf = await x509.X509CertificateGenerator.create({
    serialNumber: '03', subject: 'CN=Clave del dispositivo', issuer: apple.inter.subject, ...validity, signingAlgorithm: EC,
    publicKey: deviceKeys.publicKey, signingKey: apple.interKeys.privateKey,
    extensions: [new x509.Extension('1.2.840.113635.100.8.2', false, concat(Uint8Array.of(0x30, 0x24, 0xa1, 0x22, 0x04, 0x20), nonce))],
  });
  const attestation = b64(cbor({ fmt: 'apple-appattest', attStmt: { x5c: [new Uint8Array(leaf.rawData), new Uint8Array(apple.inter.rawData)], receipt: new Uint8Array(4) }, authData }));

  async function assertion(forChallenge, counter, { app = appId, keys = deviceKeys } = {}) {
    const authenticatorData = concat(await sha256(app), Uint8Array.of(0x01), Uint8Array.of(0, 0, 0, counter));
    const raw = new Uint8Array(await crypto.subtle.sign(EC, keys.privateKey, await sha256(concat(authenticatorData, await sha256(forChallenge)))));
    const int = (bytes) => { let b = bytes; while (b.length > 1 && b[0] === 0 && b[1] < 0x80) b = b.slice(1); if (b[0] >= 0x80) b = concat(Uint8Array.of(0), b); return concat(Uint8Array.of(0x02, b.length), b); };
    const body = concat(int(raw.slice(0, 32)), int(raw.slice(32)));
    return b64(cbor({ signature: concat(Uint8Array.of(0x30, body.length), body), authenticatorData }));
  }
  return { keyId: b64(keyIdBytes), attestation, assertion };
}

const attestorFor = (apple, extra = {}) => new AppAttestAttestor({ appId: APP, rootCertificatePem: apple.rootPem, now: () => NOW, ...extra });

test('App Attest: acepta una clave nacida en un iPhone real dentro de nuestra app, y después sus firmas', async () => {
  const apple = await fakeApple();
  const phone = await fakeIphone(apple);
  const attestor = attestorFor(apple);
  assert.equal(await attestor.hardwareId({ keyId: phone.keyId }), 'ios:' + phone.keyId);

  const registered = await attestor.verify({ challenge: CHALLENGE, payload: { keyId: phone.keyId, attestation: phone.attestation }, known: null });
  assert.equal(registered.signCount, 0);
  assert.ok(registered.publicKey.length > 65, 'devuelve la clave pública para guardarla');

  // siguientes inicios de sesión: firma el desafío nuevo con esa clave
  const known = { publicKey: registered.publicKey, signCount: 0 };
  const next = await attestor.verify({ challenge: 'otro-desafio', payload: { keyId: phone.keyId, assertion: await phone.assertion('otro-desafio', 1) }, known });
  assert.equal(next.signCount, 1);
});

test('App Attest: rechaza certificados que no son de Apple, otra app, otro desafío, claves cambiadas y ambiente de desarrollo', async () => {
  const apple = await fakeApple(), impostor = await fakeApple();
  const verify = (attestor, phone, challenge = CHALLENGE) => attestor.verify({ challenge, payload: { keyId: phone.keyId, attestation: phone.attestation }, known: null });

  // jailbreak que fabrica su propia «atestación» con una raíz propia
  await assert.rejects(verify(attestorFor(apple), await fakeIphone(impostor)), untrusted('no emitido por Apple'));
  await assert.rejects(verify(attestorFor(apple), await fakeIphone(apple, { appId: 'ABCDE12345.otra.app' })), untrusted('otra app'));
  await assert.rejects(verify(attestorFor(apple), await fakeIphone(apple), 'desafio-distinto'), untrusted('este intento'));
  await assert.rejects(verify(attestorFor(apple), await fakeIphone(apple, { signCount: 1 })), untrusted('ya se había usado'));
  // presenta la atestación de un teléfono con el id de clave de otro
  const [one, two] = [await fakeIphone(apple), await fakeIphone(apple)];
  await assert.rejects(attestorFor(apple).verify({ challenge: CHALLENGE, payload: { keyId: two.keyId, attestation: one.attestation }, known: null }), untrusted('la clave no coincide'));
  // compilación de desarrollo: solo vale si el servidor está en modo desarrollo
  const dev = await fakeIphone(apple, { aaguid: 'appattestdevelop' });
  await assert.rejects(verify(attestorFor(apple), dev), untrusted('ambiente'));
  assert.equal((await verify(attestorFor(apple, { production: false }), dev)).signCount, 0);
  // certificado vencido
  await assert.rejects(verify(attestorFor(apple, { now: () => NOW + 10 * 86_400_000 }), await fakeIphone(apple)), untrusted('no emitido por Apple'));
  await assert.rejects(attestorFor(apple).verify({ challenge: CHALLENGE, payload: { keyId: one.keyId, attestation: 'AAAA' }, known: null }), untrusted());
  await assert.rejects(attestorFor(apple).hardwareId({ keyId: 'corto' }), untrusted());
});

test('App Attest: una aserción vale solo con la clave del teléfono, para este desafío y con el contador subiendo', async () => {
  const apple = await fakeApple();
  const phone = await fakeIphone(apple), other = await fakeIphone(apple);
  const attestor = attestorFor(apple);
  const { publicKey } = await attestor.verify({ challenge: CHALLENGE, payload: { keyId: phone.keyId, attestation: phone.attestation }, known: null });
  const check = (assertion, signCount = 5, challenge = 'reto-2') => attestor.verify({ challenge, payload: { keyId: phone.keyId, assertion }, known: { publicKey, signCount } });

  assert.equal((await check(await phone.assertion('reto-2', 6))).signCount, 6);
  await assert.rejects(check(await other.assertion('reto-2', 6)), untrusted('firma del dispositivo'), 'firmada por otro teléfono');
  await assert.rejects(check(await phone.assertion('reto-1', 6)), untrusted('firma del dispositivo'), 'firma de un desafío anterior (repetición)');
  await assert.rejects(check(await phone.assertion('reto-2', 5)), untrusted('contador'), 'contador que no sube: clave clonada o repetición');
  await assert.rejects(check(await phone.assertion('reto-2', 6, { app: 'ABCDE12345.otra.app' })), untrusted('otra app'));
  await assert.rejects(check(undefined), untrusted('falta la aserción'));
});

// ───────────────────────────── SSO ─────────────────────────────
const pem = (key) => key.export({ type: 'pkcs8', format: 'pem' });
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });

test('Sign in with Apple: vale el token firmado por Apple, para nuestra app y para este intento; guarda cómo revocar', async () => {
  const s = NOW / 1000, calls = [];
  const jwks = { keys: [{ ...rsa.publicKey.export({ format: 'jwk' }), kid: 'apple-1' }] };
  const provider = new AppleIdentityProvider({
    clientId: PACKAGE, teamId: 'ABCDE12345', keyId: 'CLAVE9', privateKey: pem(ec.privateKey), now: () => NOW,
    fetch: async (url, init) => {
      calls.push({ url, body: init?.body });
      if (url.endsWith('/auth/keys')) return json(jwks);
      if (url.endsWith('/auth/token')) return json({ refresh_token: 'r.abc' });
      return json({});
    },
  });
  const token = async (over = {}, key = rsa.privateKey) => signJwt('RS256', pem(key), { kid: 'apple-1' }, {
    iss: 'https://appleid.apple.com', aud: PACKAGE, sub: '001234.abcdef', iat: s - 5, exp: s + 600, nonce: await sha256Hex(CHALLENGE), ...over });

  assert.deepEqual(await provider.verify({ identityToken: await token(), authorizationCode: 'codigo' }, CHALLENGE), { subject: '001234.abcdef', refreshToken: 'r.abc' });
  const exchange = calls.find((c) => c.url.endsWith('/auth/token')).body;
  assert.deepEqual([exchange.get('client_id'), exchange.get('code'), exchange.get('grant_type')], [PACKAGE, 'codigo', 'authorization_code']);
  const secret = decodeJwt(exchange.get('client_secret'));
  assert.deepEqual([secret.header.kid, secret.payload.iss, secret.payload.sub, secret.payload.aud], ['CLAVE9', 'ABCDE12345', PACKAGE, 'https://appleid.apple.com']);

  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  for (const bad of [token({ aud: 'otra.app' }), token({ iss: 'https://evil.example' }), token({ exp: s - 1 }), token({ nonce: await sha256Hex('otro-intento') }), token({ sub: '' }), token({}, other.privateKey)])
    await assert.rejects(async () => provider.verify({ identityToken: await bad }, CHALLENGE), (e) => e.status === 401 && e.code === 'identidad_invalida');
  await assert.rejects(provider.verify({}, CHALLENGE), (e) => e.status === 401);

  await provider.revoke('r.abc');
  const revoke = calls.at(-1);
  assert.deepEqual([revoke.url, revoke.body.get('token'), revoke.body.get('token_type_hint')], ['https://appleid.apple.com/auth/revoke', 'r.abc', 'refresh_token']);
});

test('Play Games: canjea el código del teléfono con Google y usa el id de jugador que Google responde', async () => {
  const calls = [];
  const provider = (responses) => new PlayGamesIdentityProvider({
    clientId: 'cliente.apps.googleusercontent.com', clientSecret: 'secreto',
    fetch: async (url, init) => { calls.push({ url, init }); return url.includes('oauth2') ? responses.token : responses.player; },
  });
  const ok = provider({ token: json({ access_token: 'acceso' }), player: json({ playerId: 'g0123456789', displayName: 'Ana' }) });
  assert.deepEqual(await ok.verify({ serverAuthCode: '4/abc' }), { subject: 'g0123456789', refreshToken: null });
  assert.deepEqual([calls[0].init.body.get('code'), calls[0].init.body.get('client_secret')], ['4/abc', 'secreto']);
  assert.deepEqual([calls[1].url, calls[1].init.headers.authorization], ['https://games.googleapis.com/games/v1/players/me', 'Bearer acceso']);

  await assert.rejects(provider({ token: json({ error: 'invalid_grant' }, 400) }).verify({ serverAuthCode: 'inventado' }), (e) => e.status === 401);
  await assert.rejects(provider({ token: json({ access_token: 'x' }), player: json({}, 401) }).verify({ serverAuthCode: 'x' }), (e) => e.status === 401);
  await assert.rejects(provider({ token: json({}, 503) }).verify({ serverAuthCode: 'x' }), (e) => e.status === 503);
  await assert.rejects(ok.verify({}), (e) => e.status === 401);
});
