// La API de punta a punta contra un PostgreSQL real; las tiendas y Firebase se reemplazan por dobles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { SessionRepository } from '../src/models/SessionRepository.js';
import { PurchaseRepository } from '../src/models/PurchaseRepository.js';
import { AccountRepository } from '../src/models/AccountRepository.js';
import { PurchaseService } from '../src/services/PurchaseService.js';
import { MemoryNonceStore } from '../src/services/NonceStore.js';
import { HttpError, InvalidPurchaseError, StoreUnavailableError } from '../src/services/errors.js';
import { deriveSessionKey, newNonce, sign } from '../../shared/signature.js';
import { createTestDatabase, hasDatabase } from '../../test-support/db.js';

const MASTER = 'secreto-maestro-de-prueba';
const PACK = 'cl.tiopato.pack.inicial';       // entrega slow ×3 y wide ×2

/** Tienda de mentira: conoce las compras que se le «registran» y cuenta cuántas veces se cerró cada una. */
class FakeStore {
  known = new Map(); closed = []; failClose = false;
  async verify({ transactionId, purchaseToken, productId, userId }) {
    const tx = this.known.get(transactionId ?? purchaseToken);
    if (!tx || tx.productId !== productId || tx.userId !== userId) throw new InvalidPurchaseError('desconocida');
    return { transactionId: tx.orderId, productId, quantity: tx.quantity ?? 1, environment: 'production', receipt: { orderId: tx.orderId }, purchaseToken };
  }
  async close(verified) { if (this.failClose) throw new StoreUnavailableError('caída'); this.closed.push(verified.transactionId); }
}

async function setup(t) {
  const db = await createTestDatabase();
  t.after(() => db.drop());
  const { sql } = db;
  const clock = { now: Date.now() };
  const stores = { apple: new FakeStore(), google: new FakeStore() };
  const firebaseTokens = { async verify(token) { if (!token.startsWith('fb:')) throw new HttpError(401, 'sesion_antigua_invalida'); return token.slice(3); } };
  const app = createApp({
    masterSecret: MASTER, now: () => clock.now,
    sessions: new SessionRepository(sql), nonces: new MemoryNonceStore(() => clock.now),
    accounts: new AccountRepository(sql), firebaseTokens,
    purchaseService: new PurchaseService({ purchases: new PurchaseRepository(sql), verifiers: stores }),
  });

  async function newPlayer(name, extra = {}) {
    const [user] = await sql`INSERT INTO users ${sql({ display_name: name, ...extra })} RETURNING id`;
    const [session] = await sql`INSERT INTO sessions (user_id, expires_at) VALUES (${user.id}, now() + interval '1 day') RETURNING id`;
    const key = await deriveSessionKey(MASTER, session.id);
    /** Petición firmada como la haría la app; `tamper` deja estropear algo antes de enviarla. */
    async function call(method, path, data, tamper = (r) => r) {
      const body = data === undefined ? '' : JSON.stringify(data);
      const timestamp = String(clock.now), nonce = newNonce();
      const req = tamper({ body, headers: { 'x-session': session.id, 'x-timestamp': timestamp, 'x-nonce': nonce, 'x-signature': await sign(key, body, timestamp, nonce) } });
      const res = await app.request('/v2' + path, { method, headers: req.headers, body: method === 'GET' || method === 'DELETE' ? undefined : req.body });
      return { status: res.status, json: res.status === 204 ? null : await res.json(), sent: req };
    }
    return { id: user.id, sessionId: session.id, call };
  }
  return { sql, app, clock, stores, newPlayer };
}

const skip = !hasDatabase && 'falta TEST_DATABASE_URL';

test('firma: sin firma, con el cuerpo alterado, con el reloj desfasado o repetida, la petición se rechaza', { skip }, async (t) => {
  const { app, clock, stores, newPlayer } = await setup(t);
  const ana = await newPlayer('Ana');
  stores.google.known.set('token-de-google-000000001', { orderId: 'GPA.1', productId: PACK, userId: ana.id });
  const purchase = { store: 'google', productId: PACK, purchaseToken: 'token-de-google-000000001' };

  assert.equal((await app.request('/v2/purchases', { method: 'POST', body: JSON.stringify(purchase) })).status, 401);
  const forged = await ana.call('POST', '/purchases', purchase, (r) => ({ ...r, body: r.body.replace('inicial', 'mega') }));
  assert.deepEqual([forged.status, forged.json.error], [401, 'firma_invalida']);

  const good = await ana.call('POST', '/purchases', purchase);
  assert.equal(good.status, 200);
  const replay = await app.request('/v2/purchases', { method: 'POST', headers: good.sent.headers, body: good.sent.body });
  assert.deepEqual([replay.status, (await replay.json()).error], [401, 'peticion_repetida']);

  const late = await ana.call('POST', '/purchases', purchase, (r) => ({ ...r, headers: { ...r.headers } }));
  assert.equal(late.status, 200, 'una petición nueva (otro nonce) sí pasa');
  clock.now += 31_000;                                  // la app firmó con la hora de hace 31 s
  const stale = await app.request('/v2/purchases', { method: 'POST', headers: { ...late.sent.headers, 'x-nonce': newNonce() }, body: late.sent.body });
  assert.deepEqual([stale.status, (await stale.json()).error], [401, 'reloj_desfasado']);
});

test('compras: se entregan una sola vez, solo si la tienda las confirma y solo a su dueño', { skip }, async (t) => {
  const { sql, stores, newPlayer } = await setup(t);
  const ana = await newPlayer('Ana'), beto = await newPlayer('Beto');
  stores.google.known.set('token-de-google-000000001', { orderId: 'GPA.1', productId: PACK, userId: ana.id });
  const purchase = { store: 'google', productId: PACK, purchaseToken: 'token-de-google-000000001' };

  const first = await ana.call('POST', '/purchases', purchase);
  assert.deepEqual(first.json, { granted: true, powerups: { slow: 3, wide: 2 } });
  assert.deepEqual(stores.google.closed, ['GPA.1'], 'se consumió en la tienda');

  // la app reenvía la misma compra (p. ej. se cortó internet antes de recibir la respuesta): no se duplica
  const again = await Promise.all([ana.call('POST', '/purchases', purchase), ana.call('POST', '/purchases', purchase)]);
  assert.deepEqual(again.map((r) => r.json), [{ granted: false, powerups: { slow: 3, wide: 2 } }, { granted: false, powerups: { slow: 3, wide: 2 } }]);
  assert.deepEqual(stores.google.closed, ['GPA.1']);

  // recibo inventado (Lucky Patcher / IAP Cracker): la tienda no lo conoce
  const fake = await ana.call('POST', '/purchases', { ...purchase, purchaseToken: 'token-inventado-00000000001' });
  assert.deepEqual([fake.status, fake.json.error], [422, 'compra_invalida']);
  // otro jugador intenta cobrar la compra de Ana
  const stolen = await beto.call('POST', '/purchases', purchase);
  assert.equal(stolen.status, 422);
  // producto que no existe en el catálogo
  assert.equal((await ana.call('POST', '/purchases', { ...purchase, productId: 'cl.tiopato.pack.infinito' })).status, 422);

  const ledger = await sql`SELECT powerup_id, delta, reason FROM powerup_ledger WHERE user_id = ${ana.id} ORDER BY powerup_id`;
  assert.deepEqual(ledger.map((r) => [r.powerup_id, r.delta, r.reason]), [['slow', 3, 'purchase'], ['wide', 2, 'purchase']]);
  assert.equal((await sql`SELECT count(*)::int AS n FROM purchases`)[0].n, 1);
});

test('compras: si la tienda se cae al cerrar la compra, lo entregado queda y el reintento la cierra sin entregar de nuevo', { skip }, async (t) => {
  const { stores, newPlayer } = await setup(t);
  const ana = await newPlayer('Ana');
  stores.apple.known.set('2000000123456789', { orderId: '2000000123456789', productId: PACK, userId: ana.id, quantity: 2 });
  const purchase = { store: 'apple', productId: PACK, transactionId: '2000000123456789' };

  stores.apple.failClose = true;
  const down = await ana.call('POST', '/purchases', purchase);
  assert.deepEqual([down.status, down.json.error], [503, 'tienda_no_disponible']);
  stores.apple.failClose = false;
  const retry = await ana.call('POST', '/purchases', purchase);
  assert.deepEqual(retry.json, { granted: false, powerups: { slow: 6, wide: 4 } }, 'cantidad 2 = el doble, entregado una vez');
  assert.deepEqual(stores.apple.closed, ['2000000123456789']);
});

test('cuenta antigua: se enlaza una sola vez y conserva saldo, racha y lo comprado en la V2', { skip }, async (t) => {
  const { sql, stores, newPlayer } = await setup(t);
  const [legacy] = await sql`INSERT INTO users (firebase_uid, display_name, name_key, legacy_email, status) VALUES ('uidAna', 'Ana', 'ana', 'ana@correo.cl', 'legacy_unclaimed') RETURNING id`;
  await sql`INSERT INTO wallets (user_id, earned, spent) VALUES (${legacy.id}, 9000, 2500)`;
  await sql`INSERT INTO streaks (user_id, days) VALUES (${legacy.id}, 9)`;

  const ana = await newPlayer('Jugador');                     // entró con Apple / Play Games: cuenta nueva y vacía
  await sql`INSERT INTO identities (provider, subject, user_id) VALUES ('apple', '001234.abc', ${ana.id})`;
  await sql`INSERT INTO devices (hardware_id, platform, user_id) VALUES ('hw-ana', 'ios', ${ana.id})`;
  stores.apple.known.set('2000000000000001', { orderId: '2000000000000001', productId: PACK, userId: ana.id });
  await ana.call('POST', '/purchases', { store: 'apple', productId: PACK, transactionId: '2000000000000001' });

  assert.equal((await ana.call('POST', '/account/link-legacy', { firebaseIdToken: 'token-falso' })).status, 401);
  assert.equal((await ana.call('POST', '/account/link-legacy', { firebaseIdToken: 'fb:uidNadie' })).status, 404);
  const linked = await ana.call('POST', '/account/link-legacy', { firebaseIdToken: 'fb:uidAna' });
  assert.deepEqual(linked.json, { userId: legacy.id });

  const [row] = await sql`
    SELECT u.status, u.legacy_email, w.earned - w.spent AS balance, s.days,
           (SELECT user_id FROM identities WHERE subject = '001234.abc') AS identity_owner,
           (SELECT user_id FROM devices WHERE hardware_id = 'hw-ana') AS device_owner,
           (SELECT quantity FROM powerup_inventory WHERE user_id = u.id AND powerup_id = 'slow') AS slow
    FROM users u JOIN wallets w ON w.user_id = u.id JOIN streaks s ON s.user_id = u.id WHERE u.id = ${legacy.id}`;
  assert.deepEqual({ ...row, balance: Number(row.balance) },
    { status: 'active', legacy_email: null, balance: 6500, days: 9, identity_owner: legacy.id, device_owner: legacy.id, slow: 3 });
  assert.equal((await sql`SELECT count(*)::int AS n FROM users`)[0].n, 1, 'la cuenta vacía desaparece');

  // la misma sesión sigue sirviendo (ahora es de la cuenta antigua) y repetir el enlace no rompe nada
  assert.deepEqual((await ana.call('POST', '/account/link-legacy', { firebaseIdToken: 'fb:uidAna' })).json, { userId: legacy.id });
  // otra persona no puede quedarse con una cuenta ya enlazada
  const beto = await newPlayer('Beto');
  assert.deepEqual((await beto.call('POST', '/account/link-legacy', { firebaseIdToken: 'fb:uidAna' })).json, { error: 'cuenta_antigua_ya_enlazada' });
});

test('eliminar cuenta: borra todo lo del jugador, conserva la compra sin dueño y libera el dispositivo', { skip }, async (t) => {
  const { sql, stores, newPlayer } = await setup(t);
  const ana = await newPlayer('Ana', { name_key: 'ana' });
  await sql`INSERT INTO wallets (user_id, earned) VALUES (${ana.id}, 500)`;
  await sql`INSERT INTO devices (hardware_id, platform, user_id) VALUES ('hw-ana', 'android', ${ana.id})`;
  stores.google.known.set('token-de-google-000000001', { orderId: 'GPA.1', productId: PACK, userId: ana.id });
  await ana.call('POST', '/purchases', { store: 'google', productId: PACK, purchaseToken: 'token-de-google-000000001' });

  assert.equal((await ana.call('DELETE', '/account')).status, 204);
  const [left] = await sql`
    SELECT (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM wallets)::int AS wallets, (SELECT count(*) FROM devices)::int AS devices,
           (SELECT count(*) FROM sessions)::int AS sessions, (SELECT count(*) FROM powerup_inventory)::int AS powerups,
           (SELECT count(*) FROM purchases WHERE user_id IS NULL)::int AS orphan_purchases, (SELECT count(*) FROM account_deletions)::int AS deletions`;
  assert.deepEqual({ ...left }, { users: 0, wallets: 0, devices: 0, sessions: 0, powerups: 0, orphan_purchases: 1, deletions: 1 });
  assert.equal((await ana.call('DELETE', '/account')).status, 401, 'la sesión ya no existe');
});
