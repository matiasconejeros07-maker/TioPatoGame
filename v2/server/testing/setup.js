// Arma la API completa contra un PostgreSQL real; las tiendas, el SSO, la atestación y Firebase son dobles.
import { createApp } from '../src/app.js';
import { SessionRepository } from '../src/repositories/SessionRepository.js';
import { PurchaseRepository } from '../src/repositories/PurchaseRepository.js';
import { AccountRepository } from '../src/repositories/AccountRepository.js';
import { AuthRepository } from '../src/repositories/AuthRepository.js';
import { MatchRepository } from '../src/repositories/MatchRepository.js';
import { GameRepository } from '../src/repositories/GameRepository.js';
import { PurchaseService } from '../src/services/PurchaseService.js';
import { AuthService } from '../src/services/AuthService.js';
import { ChallengeStore, MemoryRedis, NonceStore, RateLimiter } from '../src/services/stores.js';
import { SecretBox } from '../src/services/crypto.js';
import { UntrustedDeviceError } from '../src/services/attestors.js';
import { HttpError, InvalidPurchaseError, StoreUnavailableError } from '../src/services/errors.js';
import { deriveSessionKey, newNonce, sign } from '../../shared/signature.js';
import { PRODUCT_IDS, APP_ID } from '../../shared/ids.js';
import { createTestDatabase, hasDatabase } from '../../test-support/db.js';

export const MASTER = 'secreto-maestro-de-prueba';
export const PACK = PRODUCT_IDS.pack1;        // entrega slow ×3 y wide ×2
export const NO_ADS = PRODUCT_IDS.noAds;
export const skip = !hasDatabase && 'falta TEST_DATABASE_URL';

/** Tienda de mentira: conoce las compras que se le «registran» y cuenta cuántas veces se cerró cada una. */
export class FakeStore {
  known = new Map(); closed = []; failClose = false; revoked = new Set();
  async verify({ transactionId, purchaseToken, productId, userId, consumable }) {
    const tx = this.known.get(transactionId ?? purchaseToken);
    if (!tx || tx.productId !== productId || (consumable && tx.userId !== userId)) throw new InvalidPurchaseError('desconocida');
    return { transactionId: tx.orderId, productId, quantity: tx.quantity ?? 1, environment: 'production', receipt: { orderId: tx.orderId }, purchaseToken, consumable };
  }
  async close(verified) { if (this.failClose) throw new StoreUnavailableError('caída'); this.closed.push(verified.transactionId); }
  async isRevoked(transactionId) { return this.revoked.has(transactionId); }
}

/** SSO de mentira: la credencial «sub:<id>» identifica a la persona <id>. */
const fakeIdentityProvider = (revoked) => ({
  async verify({ token }) { if (!String(token).startsWith('sub:')) throw new HttpError(401, 'identidad_invalida'); return { subject: token.slice(4), refreshToken: 'refresh-' + token.slice(4) }; },
  async revoke(token) { revoked.push(token); },
});
/** Atestación de mentira: el teléfono <id> manda { device: <id> }; con { rooted: true } no pasa. */
const fakeAttestor = (platform) => ({
  async hardwareId({ device }) { return `${platform}:${device}`; },
  async verify({ payload }) { if (payload.rooted) throw new UntrustedDeviceError('root'); return { publicKey: null, signCount: 0 }; },
});

export async function setup(t) {
  const db = await createTestDatabase();
  t.after(() => db.drop());
  const { sql } = db;
  const clock = { now: Date.now() };
  const now = () => clock.now;
  const redis = new MemoryRedis(now);
  const stores = { apple: new FakeStore(), google: new FakeStore() };
  const revokedTokens = [];
  const identityProviders = { apple: fakeIdentityProvider(revokedTokens), google_play_games: fakeIdentityProvider(revokedTokens) };
  const secretBox = new SecretBox(MASTER);
  const firebaseTokens = { async verify(token) { if (!token.startsWith('fb:')) throw new HttpError(401, 'sesion_antigua_invalida'); return token.slice(3); } };
  const app = createApp({
    masterSecret: MASTER, now,
    sessions: new SessionRepository(sql), nonces: new NonceStore(redis), rateLimiter: new RateLimiter(redis),
    accounts: new AccountRepository(sql), matches: new MatchRepository(sql), game: new GameRepository(sql), firebaseTokens, identityProviders, secretBox,
    authService: new AuthService({
      challenges: new ChallengeStore(redis), auth: new AuthRepository(sql), identityProviders, secretBox, masterSecret: MASTER,
      attestors: { ios: fakeAttestor('ios'), android: fakeAttestor('android') },
    }),
    purchaseService: new PurchaseService({ purchases: new PurchaseRepository(sql), verifiers: stores }),
    googlePush: { async verify(token) { return token === 'token-de-google-pubsub' ? { iss: 'https://accounts.google.com', aud: 'https://api.ejemplo/webhooks/google', email: 'pubsub@proyecto.iam.gserviceaccount.com', email_verified: true } : null; } },
    googlePushAudience: 'https://api.ejemplo/webhooks/google', googlePushEmail: 'pubsub@proyecto.iam.gserviceaccount.com', packageName: APP_ID,
  });

  /** Cliente que firma como la app, para una sesión dada. `tamper` deja estropear algo antes de enviar. */
  function client(sessionId, keyBytes) {
    return async function call(method, path, data, tamper = (r) => r) {
      const body = data === undefined ? '' : JSON.stringify(data);
      const timestamp = String(clock.now), nonce = newNonce();
      const req = tamper({ body, headers: { 'x-session': sessionId, 'x-timestamp': timestamp, 'x-nonce': nonce, 'x-signature': await sign(keyBytes, body, timestamp, nonce) } });
      const res = await app.request('/v2' + path, { method, headers: req.headers, body: method === 'GET' || method === 'DELETE' ? undefined : req.body });
      return { status: res.status, json: res.status === 204 ? null : await res.json(), sent: req };
    };
  }

  /** Jugador creado directo en la base (para las pruebas que no tratan del inicio de sesión). */
  async function newPlayer(name, extra = {}) {
    const [user] = await sql`INSERT INTO users ${sql({ display_name: name, ...extra })} RETURNING id`;
    await sql`INSERT INTO wallets (user_id) VALUES (${user.id})`;
    const [session] = await sql`INSERT INTO sessions (user_id, expires_at) VALUES (${user.id}, now() + interval '1 day') RETURNING id`;
    return { id: user.id, sessionId: session.id, call: client(session.id, await deriveSessionKey(MASTER, session.id)) };
  }

  /** Petición sin sesión (inicio de sesión, avisos de las tiendas). */
  async function post(path, data, headers = {}) {
    const res = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7', ...headers }, body: JSON.stringify(data) });
    return { status: res.status, json: await res.json() };
  }
  return { sql, app, clock, stores, revokedTokens, newPlayer, client, post };
}
