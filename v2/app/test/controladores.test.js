// Los controladores con servicios de plataforma falsos (sin teléfono, sin AdMob, sin tienda).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/composition.js';
import { GameState } from '../src/models/GameFlowModel.js';
import { PurchaseOutcome } from '../src/controllers/PurchaseController.js';
import { ApiClient, ApiError } from '../src/services/ApiClient.js';
import { verify } from '../../shared/signature.js';

function fakes({ canRequestAds = true } = {}) {
  const log = [];
  const state = { adLoads: true, apiError: null, pending: [], storeResult: undefined };
  const services = {
    getUserId: () => 'usuario-1',
    consent: { async gather() { log.push('consent'); return { canRequestAds, privacyOptionsRequired: true }; }, async showPrivacyOptions() {} },
    ads: {
      async initialize() { log.push('ads:init'); },
      async loadInterstitial() { log.push('ads:load'); return state.adLoads; },
      async showInterstitial() { log.push('ads:show'); },
    },
    store: {
      async getProducts(ids) { return [{ productId: ids[0], priceLabel: '$990' }, { productId: 'desconocido', priceLabel: '$1' }]; },
      async purchase(productId, userId) { log.push(`store:buy:${userId}`); return state.storeResult === undefined ? { store: 'google', productId, purchaseToken: 'tok' } : state.storeResult; },
      async pendingPurchases() { return state.pending; },
      async finish(p) { log.push('store:finish:' + (p.purchaseToken ?? p.transactionId)); },
    },
    api: { async request(method, path, data) { log.push(`api:${method}${path}`); if (state.apiError) throw state.apiError; return { granted: true, powerups: { slow: 3 } }; } },
  };
  return { services, log, state };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test('arranque: primero el consentimiento, y solo si se acepta se inician los anuncios', async () => {
  const yes = fakes();
  const game = createGame(yes.services);
  const states = [];
  game.models.flow.on('change', (e) => states.push(e.state));
  await game.controllers.flow.boot();
  assert.deepEqual(states, [GameState.CONSENT, GameState.MENU]);
  assert.deepEqual(yes.log.slice(0, 3), ['consent', 'ads:init', 'ads:load']);
  assert.equal(game.controllers.consent.privacyOptionsRequired, true);

  const no = fakes({ canRequestAds: false });
  const quiet = createGame(no.services);
  await quiet.controllers.flow.boot();
  quiet.controllers.flow.startMatch(); quiet.controllers.flow.endMatch();
  await quiet.controllers.flow.leaveGameOver();
  assert.deepEqual(no.log, ['consent'], 'sin consentimiento no se toca AdMob');
  assert.equal(quiet.models.flow.state, GameState.MENU);
});

test('anuncios: salen solo en la pausa entre partidas, según la política, y el juego sigue aunque fallen', async () => {
  const { services, log } = fakes();
  let now = 0;
  const game = createGame(services);
  const { flow, ads } = game.controllers;
  flow.now = ads.now = () => now;
  await flow.boot();
  const shown = [];
  for (let i = 0; i < 4; i++) {
    flow.startMatch();
    now += 60_000;
    flow.endMatch();
    const before = log.filter((l) => l === 'ads:show').length;
    await flow.leaveGameOver(i === 3 ? GameState.MENU : GameState.PLAYING);
    shown.push(log.filter((l) => l === 'ads:show').length - before);
    if (i < 3) { assert.equal(game.models.flow.state, GameState.PLAYING); now += 30_000; flow.endMatch(); await flow.leaveGameOver(); }
    await settle();
  }
  // 8 partidas en total (dos por vuelta): hay anuncios, nunca dos seguidos, ninguno en las primeras
  assert.equal(shown[0], 0);
  assert.ok(log.filter((l) => l === 'ads:show').length >= 1);
  assert.equal(game.models.flow.state, GameState.MENU);

  services.ads.showInterstitial = async () => { throw new Error('AdMob falló'); };
  now += 600_000;
  for (let i = 0; i < 4; i++) { flow.startMatch(); now += 60_000; flow.endMatch(); await flow.leaveGameOver(); await settle(); }
  assert.equal(game.models.flow.state, GameState.MENU, 'un anuncio que falla no deja el juego pegado');
});

test('compras: el inventario solo cambia con la respuesta del servidor', async () => {
  const { services, log, state } = fakes();
  const game = createGame(services);
  const { purchases } = game.controllers;
  assert.deepEqual(await purchases.offers(), [{ name: 'Pack Inicial', grants: { slow: 3, wide: 2 }, productId: 'cl.tiopato.pack.inicial', priceLabel: '$990' }]);

  assert.equal(await purchases.buy('cl.tiopato.pack.inicial'), PurchaseOutcome.DELIVERED);
  assert.deepEqual(game.models.powerUps.all(), { slow: 3 });
  assert.deepEqual(log, ['store:buy:usuario-1', 'api:POST/purchases', 'store:finish:tok']);

  state.storeResult = null;
  assert.equal(await purchases.buy('cl.tiopato.pack.inicial'), PurchaseOutcome.CANCELLED);

  // sin conexión: la compra queda pagada y pendiente, NO se cierra y no se regala nada en la app
  state.storeResult = undefined; state.apiError = new TypeError('sin red'); log.length = 0;
  game.models.powerUps.replace({});
  assert.equal(await purchases.buy('cl.tiopato.pack.inicial'), PurchaseOutcome.PENDING);
  assert.deepEqual(game.models.powerUps.all(), {});
  assert.ok(!log.some((l) => l.startsWith('store:finish')));

  // al volver a abrir la app se recupera sola
  state.apiError = null; state.pending = [{ store: 'apple', productId: 'cl.tiopato.pack.inicial', transactionId: '77' }];
  await purchases.recoverPending();
  assert.deepEqual(game.models.powerUps.all(), { slow: 3 });
  assert.equal(log.at(-1), 'store:finish:77');

  // el servidor dice que el recibo no vale: no se entrega nada y se saca de la cola
  state.apiError = new ApiError(422, 'compra_invalida'); game.models.powerUps.replace({});
  assert.equal(await purchases.buy('cl.tiopato.pack.inicial'), PurchaseOutcome.REJECTED);
  assert.deepEqual(game.models.powerUps.all(), {});
});

test('ApiClient: firma cada petición y corrige el reloj del teléfono si está corrido', async () => {
  const key = new Uint8Array(32).fill(7);
  const serverNow = 1_800_000_100_000, phoneNow = 1_800_000_000_000;      // el teléfono va 100 s atrasado
  const seen = [];
  const api = new ApiClient({
    baseUrl: 'https://api.ejemplo', now: () => phoneNow, getSession: async () => ({ id: 'sesion-1', key }),
    fetch: async (url, init = {}) => {
      if (url.endsWith('/health')) return Response.json({ ok: true, now: serverNow });
      const h = init.headers, body = init.body ?? '';
      seen.push({ url, timestamp: h['x-timestamp'], nonce: h['x-nonce'], valid: await verify(key, body, h['x-timestamp'], h['x-nonce'], h['x-signature']) });
      return Math.abs(serverNow - Number(h['x-timestamp'])) > 30_000 ? Response.json({ error: 'reloj_desfasado' }, { status: 401 }) : Response.json({ ok: 1 });
    },
  });
  assert.deepEqual(await api.request('POST', '/purchases', { a: 1 }), { ok: 1 });
  assert.equal(seen.length, 2);
  assert.ok(seen.every((s) => s.valid), 'las dos peticiones van bien firmadas');
  assert.notEqual(seen[0].nonce, seen[1].nonce);
  assert.equal(Number(seen[1].timestamp), serverNow);
  await assert.rejects(new ApiClient({ baseUrl: '', getSession: async () => null }).request('GET', '/x'), (e) => e.code === 'sin_sesion');
});
