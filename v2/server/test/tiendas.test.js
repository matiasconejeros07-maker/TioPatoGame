// Los validadores hablan con Apple, Google y Firebase por HTTPS; aquí se reemplaza `fetch` por respuestas grabadas
// y se firma con claves generadas en la prueba, para comprobar qué preguntan y cómo interpretan cada respuesta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { AppleStoreVerifier } from '../src/services/AppleStoreVerifier.js';
import { GooglePlayVerifier } from '../src/services/GooglePlayVerifier.js';
import { FirebaseTokenVerifier } from '../src/services/FirebaseTokenVerifier.js';
import { decodeJwt, signJwt, verifyRs256 } from '../src/services/jwt.js';
import { InvalidPurchaseError, StoreUnavailableError, HttpError } from '../src/services/errors.js';

const pem = (key) => key.export({ type: 'pkcs8', format: 'pem' });
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const USER = '6f1c2a34-0000-4000-8000-000000000001';
const PACK = 'cl.tiopato.pack.hielo';
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const fakeJws = (payload) => `${btoa('{"alg":"ES256"}')}.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.firma`;

function apple(responses, extra = {}) {
  const calls = [];
  const verifier = new AppleStoreVerifier({
    issuerId: 'emisor', keyId: 'CLAVE1', privateKey: pem(ec.privateKey), bundleId: 'cl.tiopato.juego', ...extra,
    fetch: async (url, init) => { calls.push({ url, init }); return responses[new URL(url).host] ?? json({}, 404); },
  });
  return { verifier, calls };
}
const appleTx = (over = {}) => ({ transactionId: '2000000123', bundleId: 'cl.tiopato.juego', productId: PACK, type: 'Consumable', appAccountToken: USER.toUpperCase(), quantity: 1, ...over });
const PROD = 'api.storekit.itunes.apple.com', SANDBOX = 'api.storekit-sandbox.itunes.apple.com';

test('Apple: acepta la transacción que Apple confirma y se identifica con un JWT ES256 válido', async () => {
  const { verifier, calls } = apple({ [PROD]: json({ signedTransactionInfo: fakeJws(appleTx()) }) });
  const result = await verifier.verify({ transactionId: '2000000123', productId: PACK, userId: USER });
  assert.deepEqual([result.transactionId, result.environment, result.quantity], ['2000000123', 'production', 1]);
  assert.equal(calls[0].url, `https://${PROD}/inApps/v1/transactions/2000000123`);
  const { header, payload } = decodeJwt(calls[0].init.headers.authorization.replace('Bearer ', ''));
  assert.deepEqual([header.alg, header.kid, payload.iss, payload.aud, payload.bid], ['ES256', 'CLAVE1', 'emisor', 'appstoreconnect-v1', 'cl.tiopato.juego']);
});

test('Apple: rechaza reembolsos, otra app, otro producto, otra cuenta, ids raros y transacciones desconocidas', async () => {
  for (const over of [{ revocationDate: 1 }, { bundleId: 'otra.app' }, { productId: 'otro' }, { appAccountToken: 'otra-cuenta' }, { appAccountToken: undefined }, { type: 'Non-Consumable' }]) {
    const { verifier } = apple({ [PROD]: json({ signedTransactionInfo: fakeJws(appleTx(over)) }) });
    await assert.rejects(verifier.verify({ transactionId: '2000000123', productId: PACK, userId: USER }), InvalidPurchaseError, JSON.stringify(over));
  }
  // una compra permanente es del Apple ID (se puede restaurar), pero tiene que ser de ese tipo
  const permanent = apple({ [PROD]: json({ signedTransactionInfo: fakeJws(appleTx({ type: 'Non-Consumable', appAccountToken: 'otra-cuenta' })) }) });
  assert.equal((await permanent.verifier.verify({ transactionId: '2000000123', productId: PACK, userId: USER, consumable: false })).transactionId, '2000000123');
  const { verifier, calls } = apple({});
  await assert.rejects(verifier.verify({ transactionId: '../../x', productId: PACK, userId: USER }), InvalidPurchaseError);
  assert.equal(calls.length, 0, 'un id con formato raro ni siquiera se consulta');
  await assert.rejects(verifier.verify({ transactionId: '999', productId: PACK, userId: USER }), InvalidPurchaseError);
  await assert.rejects(apple({ [PROD]: json({}, 500) }).verifier.verify({ transactionId: '999', productId: PACK, userId: USER }), StoreUnavailableError);
});

test('Apple: las compras de prueba (sandbox) solo valen si está permitido', async () => {
  const responses = { [SANDBOX]: json({ signedTransactionInfo: fakeJws(appleTx()) }) };
  await assert.rejects(apple(responses).verifier.verify({ transactionId: '2000000123', productId: PACK, userId: USER }), InvalidPurchaseError);
  const ok = await apple(responses, { allowSandbox: true }).verifier.verify({ transactionId: '2000000123', productId: PACK, userId: USER });
  assert.equal(ok.environment, 'sandbox');
});

function google(purchase, status = 200, extra = {}) {
  const calls = [];
  const verifier = new GooglePlayVerifier({
    packageName: 'cl.tiopato.juego', clientEmail: 'robot@proyecto.iam.gserviceaccount.com', privateKey: pem(rsa.privateKey), ...extra,
    fetch: async (url, init = {}) => {
      calls.push({ url, init });
      if (url === 'https://oauth2.googleapis.com/token') return json({ access_token: 'acceso', expires_in: 3600 });
      return json(purchase, status);
    },
  });
  return { verifier, calls };
}
const TOKEN = 'token.de-compra_de_google_0123456789';
const googlePurchase = (over = {}) => ({ purchaseState: 0, consumptionState: 0, orderId: 'GPA.3300-1', obfuscatedExternalAccountId: USER, ...over });

test('Google: acepta la compra pagada, pide acceso con un JWT RS256 de la cuenta de servicio y luego la consume', async () => {
  const { verifier, calls } = google(googlePurchase());
  const result = await verifier.verify({ purchaseToken: TOKEN, productId: PACK, userId: USER });
  assert.deepEqual([result.transactionId, result.environment], ['GPA.3300-1', 'production']);
  const assertion = calls[0].init.body.get('assertion');
  const jwk = rsa.publicKey.export({ format: 'jwk' });
  const claims = await verifyRs256(assertion, { keys: [{ ...jwk, kid: undefined }] });
  assert.deepEqual([claims.iss, claims.scope], ['robot@proyecto.iam.gserviceaccount.com', 'https://www.googleapis.com/auth/androidpublisher']);
  assert.equal(calls[1].url, `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/cl.tiopato.juego/purchases/products/${PACK}/tokens/${TOKEN}`);
  assert.equal(calls[1].init.headers.authorization, 'Bearer acceso');

  await verifier.close(result);
  assert.deepEqual([calls[2].init.method, calls[2].url.endsWith(TOKEN + ':consume')], ['POST', true]);
  await verifier.close({ ...result, consumable: false });
  assert.equal(calls[3].url.endsWith(TOKEN + ':acknowledge'), true, 'una compra permanente se confirma, no se consume');
  assert.equal(calls.filter((c) => c.url.includes('oauth2')).length, 1, 'el acceso se reutiliza');
});

test('Google: rechaza compras pendientes o anuladas, de otra cuenta, de prueba y tokens desconocidos', async () => {
  for (const over of [{ purchaseState: 1 }, { purchaseState: 2 }, { obfuscatedExternalAccountId: 'otra' }, { purchaseType: 0 }, { orderId: undefined }])
    await assert.rejects(google(googlePurchase(over)).verifier.verify({ purchaseToken: TOKEN, productId: PACK, userId: USER }), InvalidPurchaseError, JSON.stringify(over));
  await assert.rejects(google({}, 404).verifier.verify({ purchaseToken: TOKEN, productId: PACK, userId: USER }), InvalidPurchaseError);
  await assert.rejects(google({}, 500).verifier.verify({ purchaseToken: TOKEN, productId: PACK, userId: USER }), StoreUnavailableError);
  await assert.rejects(google(googlePurchase()).verifier.verify({ purchaseToken: 'corto', productId: PACK, userId: USER }), InvalidPurchaseError);
  const test = await google(googlePurchase({ purchaseType: 0 }), 200, { allowSandbox: true }).verifier.verify({ purchaseToken: TOKEN, productId: PACK, userId: USER });
  assert.equal(test.environment, 'sandbox');
});

test('Firebase: solo vale un ID token firmado por Google, de este proyecto, vigente y con contraseña recién escrita', async () => {
  const now = 1_800_000_000_000, s = now / 1000;
  const jwks = { keys: [{ ...rsa.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }] };
  const verifier = new FirebaseTokenVerifier({ projectId: 'juegotiopato', now: () => now, fetch: async () => json(jwks) });
  const token = (over = {}, key = rsa.privateKey) => signJwt('RS256', pem(key), { kid: 'k1' }, {
    aud: 'juegotiopato', iss: 'https://securetoken.google.com/juegotiopato', sub: 'uidAna', iat: s - 10, exp: s + 3590, auth_time: s - 10, ...over });

  assert.equal(await verifier.verify(await token()), 'uidAna');
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  for (const bad of [token({ aud: 'otro-proyecto' }), token({ iss: 'https://securetoken.google.com/otro' }), token({ exp: s - 1 }), token({ auth_time: s - 3600 }), token({ sub: '' }), token({}, other.privateKey), 'no-es-un-token'])
    await assert.rejects(async () => verifier.verify(await bad), (e) => e instanceof HttpError && e.status === 401);
});
