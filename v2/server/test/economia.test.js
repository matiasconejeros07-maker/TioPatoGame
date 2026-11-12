// Uso de power-ups en la partida, compra con pesos, reembolsos y cuadro VIP, contra PostgreSQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, skip, PACK, NO_ADS } from '../testing/setup.js';
import { APP_ID } from '../../shared/ids.js';

const jws = (payload) => `${btoa('{"alg":"ES256"}')}.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.firma`;
const appleNotice = (notificationType, transactionId) => ({ signedPayload: jws({ notificationType, data: { signedTransactionInfo: jws({ transactionId }) } }) });
const googleNotice = (event) => ({ message: { data: btoa(JSON.stringify({ packageName: APP_ID, ...event })) } });
const GOOGLE_AUTH = { authorization: 'Bearer token-de-google-pubsub' };

async function withPack(ctx, name = 'Ana') {
  const player = await ctx.newPlayer(name);
  ctx.stores.google.known.set('token-de-google-000000001', { orderId: 'GPA.1', productId: PACK, userId: player.id });
  await player.call('POST', '/purchases', { store: 'google', productId: PACK, purchaseToken: 'token-de-google-000000001' });   // slow ×3, wide ×2
  return player;
}

test('power-ups: se descuentan al usarlos, solo en modo arcade y máximo 3 por partida', { skip }, async (t) => {
  const ctx = await setup(t);
  const ana = await withPack(ctx);

  const classic = (await ana.call('POST', '/matches', { mode: 'classic' })).json;
  assert.equal((await ana.call('POST', `/matches/${classic.matchId}/powerups`, { powerupId: 'slow' })).json.error, 'modo_clasico_sin_powerups');
  assert.equal((await ana.call('POST', '/matches', { mode: 'turbo' })).status, 422);

  const { matchId } = (await ana.call('POST', '/matches', { mode: 'arcade' })).json;
  assert.equal((await ana.call('POST', `/matches/${classic.matchId}/powerups`, { powerupId: 'slow' })).json.error, 'partida_cerrada', 'empezar otra partida cierra la anterior');
  const use = (powerupId, id = matchId) => ana.call('POST', `/matches/${id}/powerups`, { powerupId });

  assert.deepEqual((await use('slow')).json, { powerupId: 'slow', remaining: 2, usedThisMatch: 1, durationMs: 10000 });
  assert.equal((await use('slow')).json.error, 'powerup_ya_activo', 'el mismo no se apila mientras dura');
  assert.equal((await use('freeze')).json.error, 'sin_powerups', 'no tiene de ese');
  assert.equal((await use('turbo')).status, 422);
  // dos toques a la vez sobre el mismo: se gasta uno solo
  const both = await Promise.all([use('wide'), use('wide')]);
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
  await ctx.sql`UPDATE match_powerups SET used_at = now() - interval '11 seconds' WHERE match_id = ${matchId}`;   // pasan los 10 s
  assert.equal((await use('slow')).json.usedThisMatch, 3);
  await ctx.sql`UPDATE match_powerups SET used_at = now() - interval '11 seconds' WHERE match_id = ${matchId}`;
  assert.equal((await use('wide')).json.error, 'limite_por_partida');

  assert.deepEqual((await ana.call('GET', '/purchases')).json.powerups, { slow: 1, wide: 1 });
  const ledger = await ctx.sql`SELECT powerup_id, delta FROM powerup_ledger WHERE reason = 'match' ORDER BY id`;
  assert.deepEqual(ledger.map((r) => [r.powerup_id, r.delta]), [['slow', -1], ['wide', -1], ['slow', -1]]);
  // nadie usa los power-ups de la partida de otro
  const beto = await ctx.newPlayer('Beto');
  assert.equal((await beto.call('POST', `/matches/${matchId}/powerups`, { powerupId: 'slow' })).status, 404);
});

test('power-ups con pesos del juego: $500.000 cada uno y solo si alcanza el saldo', { skip }, async (t) => {
  const ctx = await setup(t);
  const ana = await ctx.newPlayer('Ana');
  await ctx.sql`UPDATE wallets SET earned = 1200000, spent = 100000 WHERE user_id = ${ana.id}`;      // saldo $1.100.000

  assert.deepEqual((await ana.call('POST', '/purchases/powerups', { powerupId: 'freeze' })).json, { balance: 600000, powerups: { freeze: 1 }, entitlements: [] });
  // dos compras a la vez con saldo para una sola
  const both = await Promise.all([ana.call('POST', '/purchases/powerups', { powerupId: 'freeze' }), ana.call('POST', '/purchases/powerups', { powerupId: 'slow' })]);
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
  assert.equal(both.find((r) => r.status === 409).json.error, 'saldo_insuficiente');
  const [wallet] = await ctx.sql`SELECT earned - spent AS balance FROM wallets WHERE user_id = ${ana.id}`;
  assert.equal(Number(wallet.balance), 100000);
  assert.equal((await ctx.sql`SELECT sum(quantity)::int AS n FROM powerup_inventory`)[0].n, 2);
  assert.equal((await ana.call('POST', '/purchases/powerups', { powerupId: 'turbo' })).status, 422);
});

test('reembolso de Apple: solo si Apple lo confirma; quita lo entregado una vez y lo ya usado queda como deuda', { skip }, async (t) => {
  const ctx = await setup(t);
  const ana = await ctx.newPlayer('Ana');
  ctx.stores.apple.known.set('2000000000000001', { orderId: '2000000000000001', productId: PACK, userId: ana.id });
  await ana.call('POST', '/purchases', { store: 'apple', productId: PACK, transactionId: '2000000000000001' });
  const { matchId } = (await ana.call('POST', '/matches', { mode: 'arcade' })).json;
  await ana.call('POST', `/matches/${matchId}/powerups`, { powerupId: 'wide' });
  await ana.call('POST', `/matches/${matchId}/powerups`, { powerupId: 'slow' });      // le quedan slow 2, wide 1

  // aviso falso (cualquiera puede escribirle al webhook): Apple no confirma el reembolso → no pasa nada
  assert.equal((await ctx.post('/webhooks/apple', appleNotice('REFUND', '2000000000000001'))).status, 200);
  assert.deepEqual((await ana.call('GET', '/purchases')).json.powerups, { slow: 2, wide: 1 });
  assert.equal((await ctx.post('/webhooks/apple', { signedPayload: 'basura' })).status, 400);

  ctx.stores.apple.revoked.add('2000000000000001');
  await ctx.post('/webhooks/apple', appleNotice('DID_RENEW', '2000000000000001'));      // otro tipo de aviso: se ignora
  assert.deepEqual((await ana.call('GET', '/purchases')).json.powerups, { slow: 2, wide: 1 });
  await ctx.post('/webhooks/apple', appleNotice('REFUND', '2000000000000001'));
  await ctx.post('/webhooks/apple', appleNotice('REFUND', '2000000000000001'));          // Apple reintenta: no se descuenta dos veces
  assert.deepEqual((await ana.call('GET', '/purchases')).json.powerups, { slow: 0, wide: 0 });
  const rows = await ctx.sql`SELECT powerup_id, quantity FROM powerup_inventory ORDER BY 1`;
  assert.deepEqual(rows.map((r) => [r.powerup_id, r.quantity]), [['slow', -1], ['wide', -1]], 'debe los 2 que alcanzó a usar');
  assert.equal((await ctx.sql`SELECT status FROM purchases`)[0].status, 'refunded');

  // la próxima compra primero salda la deuda
  ctx.stores.apple.known.set('2000000000000002', { orderId: '2000000000000002', productId: PACK, userId: ana.id });
  const next = await ana.call('POST', '/purchases', { store: 'apple', productId: PACK, transactionId: '2000000000000002' });
  assert.deepEqual(next.json.powerups, { slow: 2, wide: 1 });
});

test('reembolso de Google: exige el aviso firmado por Google; revoca packs y «Sin anuncios»', { skip }, async (t) => {
  const ctx = await setup(t);
  const ana = await withPack(ctx);
  ctx.stores.google.known.set('token-de-google-000000002', { orderId: 'GPA.2', productId: NO_ADS, userId: ana.id });
  await ana.call('POST', '/purchases', { store: 'google', productId: NO_ADS, purchaseToken: 'token-de-google-000000002' });
  assert.deepEqual((await ana.call('GET', '/purchases')).json, { powerups: { slow: 3, wide: 2 }, entitlements: ['no_ads'] });

  const voided = googleNotice({ voidedPurchaseNotification: { orderId: 'GPA.2', purchaseToken: 'token-de-google-000000002' } });
  assert.equal((await ctx.post('/webhooks/google', voided)).status, 401, 'sin el token de Google');
  assert.equal((await ctx.post('/webhooks/google', voided, { authorization: 'Bearer inventado' })).status, 401);
  assert.deepEqual((await ana.call('GET', '/purchases')).json.entitlements, ['no_ads']);

  assert.equal((await ctx.post('/webhooks/google', voided, GOOGLE_AUTH)).status, 200);
  assert.deepEqual((await ana.call('GET', '/purchases')).json, { powerups: { slow: 3, wide: 2 }, entitlements: [] }, 'vuelven los anuncios');
  // «Restaurar compras» no revive una compra reembolsada
  await ana.call('POST', '/purchases', { store: 'google', productId: NO_ADS, purchaseToken: 'token-de-google-000000002' });
  assert.deepEqual((await ana.call('GET', '/purchases')).json.entitlements, []);

  // aviso de otra app, o de otro tipo: se ignora
  await ctx.post('/webhooks/google', { message: { data: btoa(JSON.stringify({ packageName: 'otra.app', voidedPurchaseNotification: { orderId: 'GPA.1' } })) } }, GOOGLE_AUTH);
  await ctx.post('/webhooks/google', googleNotice({ testNotification: { version: '1.0' } }), GOOGLE_AUTH);
  assert.deepEqual((await ana.call('GET', '/purchases')).json.powerups, { slow: 3, wide: 2 });
  await ctx.post('/webhooks/google', googleNotice({ voidedPurchaseNotification: { orderId: 'GPA.1' } }), GOOGLE_AUTH);
  assert.deepEqual((await ana.call('GET', '/purchases')).json.powerups, { slow: 0, wide: 0 });
});

test('cuadro VIP: solo quien tiene el personaje secreto deja su WhatsApp, y queda en la base', { skip }, async (t) => {
  const ctx = await setup(t);
  const ana = await ctx.newPlayer('Ana');
  const contact = { whatsapp: '+56912345678', consent: true };
  assert.equal((await ana.call('PUT', '/account/vip', contact)).json.error, 'sin_personaje_secreto');
  await ctx.sql`INSERT INTO inventory (user_id, item_id) VALUES (${ana.id}, 'ch_millonario')`;
  assert.equal((await ana.call('PUT', '/account/vip', { ...contact, whatsapp: '912345678' })).json.error, 'numero_invalido');
  assert.equal((await ana.call('PUT', '/account/vip', { ...contact, consent: false })).json.error, 'falta_consentimiento');
  assert.equal((await ana.call('PUT', '/account/vip', contact)).status, 204);
  assert.equal((await ana.call('PUT', '/account/vip', { ...contact, whatsapp: '+56987654321' })).status, 204, 'puede corregirlo');
  const rows = await ctx.sql`SELECT u.display_name, v.whatsapp, v.consent FROM vip_contacts v JOIN users u ON u.id = v.user_id`;
  assert.deepEqual(rows.map((r) => ({ ...r })), [{ display_name: 'Ana', whatsapp: '+56987654321', consent: true }]);
});
