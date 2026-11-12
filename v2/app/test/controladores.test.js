// Los controladores con servicios de plataforma falsos (sin teléfono, sin AdMob, sin tienda).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/composition.js';
import { GameState } from '../src/models/GameFlowModel.js';
import { PurchaseOutcome } from '../src/controllers/PurchaseController.js';
import { RenameOutcome } from '../src/controllers/ProfileController.js';
import { ApiClient, ApiError } from '../src/services/ApiClient.js';
import { verify } from '../../shared/signature.js';

const PACK = 'cl.tiopato.pack.inicial', NO_ADS = 'cl.tiopato.sinanuncios';

function fakes({ consentAnswered = true, owned = { powerups: {}, entitlements: [] } } = {}) {
  const log = [];
  const state = { consentAnswered, adLoads: true, apiError: null, pending: [], restorable: [], storeResult: undefined, owned };
  const services = {
    getUserId: () => 'usuario-1',
    // canRequestAds es true cuando el jugador ya respondió el formulario, haya aceptado o rechazado
    consent: { async gather() { log.push('consent'); return { canRequestAds: state.consentAnswered, privacyOptionsRequired: true }; }, async showPrivacyOptions() {} },
    ads: {
      async initialize() { log.push('ads:init'); },
      async loadInterstitial() { log.push('ads:load'); return state.adLoads; },
      async showInterstitial() { log.push('ads:show'); },
    },
    store: {
      async getProducts(ids) { return [...ids.filter((id) => id === PACK || id === NO_ADS), 'desconocido'].map((productId) => ({ productId, priceLabel: '$990' })); },
      async purchase(productId, userId) { log.push(`store:buy:${userId}`); return state.storeResult === undefined ? { store: 'google', productId, purchaseToken: 'tok' } : state.storeResult; },
      async pendingPurchases() { return state.pending; },
      async restorablePurchases() { return state.restorable; },
      async finish(p) { log.push('store:finish:' + (p.purchaseToken ?? p.transactionId)); },
    },
    api: {
      async request(method, path, data) {
        log.push(`api:${method}${path}`);
        if (state.apiError) throw state.apiError;
        if (path === '/account/name') return { displayName: data.name, nextChangeAt: '2099-01-01T00:00:00.000Z' };
        if (method === 'POST' && data.productId === NO_ADS) state.owned = { ...state.owned, entitlements: ['no_ads'] };
        if (method === 'POST' && data.productId === PACK) state.owned = { ...state.owned, powerups: { slow: 3 } };
        return method === 'POST' ? { granted: true, ...state.owned } : state.owned;
      },
    },
  };
  return { services, log, state };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const count = (log, entry) => log.filter((l) => l === entry).length;
/** Juega una partida completa y vuelve al menú. @returns si salió un anuncio */
async function playMatch(game, log) {
  const before = count(log, 'ads:show');
  game.controllers.flow.startMatch();
  game.controllers.flow.endMatch();
  await game.controllers.flow.leaveGameOver();
  await settle();
  return count(log, 'ads:show') > before;
}

test('arranque: primero el consentimiento y recién después AdMob', async () => {
  const { services, log } = fakes();
  const game = createGame(services);
  const states = [];
  game.models.flow.on('change', (e) => states.push(e.state));
  await game.controllers.flow.boot();
  assert.deepEqual(states, [GameState.CONSENT, GameState.MENU]);
  assert.deepEqual(log.slice(0, 4), ['api:GET/purchases', 'consent', 'ads:init', 'ads:load']);
  assert.equal(game.controllers.consent.privacyOptionsRequired, true);
});

test('anuncios: uno cada 5 partidas exactas, siempre entre partidas', async () => {
  const { services, log } = fakes();
  const game = createGame(services);
  await game.controllers.flow.boot();
  const shown = [];
  for (let i = 0; i < 15; i++) shown.push(await playMatch(game, log));
  assert.deepEqual(shown.map((s, i) => (s ? i + 1 : 0)).filter(Boolean), [5, 10, 15]);
  assert.equal(game.models.flow.state, GameState.MENU);
});

test('anuncios: sin el formulario de consentimiento respondido no se pide ninguno, pero se insiste en cada pausa hasta que responda', async () => {
  const { services, log, state } = fakes({ consentAnswered: false });
  const game = createGame(services);
  await game.controllers.flow.boot();
  for (let i = 0; i < 6; i++) assert.equal(await playMatch(game, log), false);
  assert.ok(!log.some((l) => l.startsWith('ads:')), 'AdMob no se toca antes del consentimiento');
  assert.equal(count(log, 'consent'), 3, 'al abrir, y otra vez en las pausas de las partidas 5 y 6');

  state.consentAnswered = true;                 // responde el formulario (acepte o rechace)
  const next = [await playMatch(game, log), await playMatch(game, log)];
  assert.equal(next.filter(Boolean).length, 1, 'el anuncio pendiente sale apenas se puede: en esa pausa o en la siguiente');
  assert.deepEqual(log.filter((l) => l.startsWith('ads:')).slice(0, 2), ['ads:init', 'ads:load']);
});

test('anuncios: si no hay anuncio cargado o AdMob falla, el juego sigue y el anuncio queda pendiente', async () => {
  const { services, log, state } = fakes();
  state.adLoads = false;
  const game = createGame(services);
  await game.controllers.flow.boot();
  for (let i = 0; i < 6; i++) assert.equal(await playMatch(game, log), false);
  state.adLoads = true;
  assert.equal(await playMatch(game, log), false);   // en esta pausa se carga
  assert.equal(await playMatch(game, log), true);
  services.ads.showInterstitial = async () => { throw new Error('AdMob falló'); };
  for (let i = 0; i < 6; i++) await playMatch(game, log);
  assert.equal(game.models.flow.state, GameState.MENU, 'un anuncio que falla no deja el juego pegado');
});

test('«Sin anuncios»: quien lo compró no ve anuncios ni el formulario; comprarlo a mitad de sesión los corta al tiro', async () => {
  const paid = fakes({ owned: { powerups: {}, entitlements: ['no_ads'] } });
  const free = createGame(paid.services);
  await free.controllers.flow.boot();
  for (let i = 0; i < 12; i++) assert.equal(await playMatch(free, paid.log), false);
  assert.deepEqual(paid.log, ['api:GET/purchases']);

  const { services, log, state } = fakes();
  const game = createGame(services);
  await game.controllers.flow.boot();
  for (let i = 0; i < 4; i++) await playMatch(game, log);
  assert.deepEqual((await game.controllers.purchases.offers()).permanent.map((o) => o.name), ['Sin anuncios']);
  assert.equal(await game.controllers.purchases.buy(NO_ADS), PurchaseOutcome.DELIVERED);
  assert.equal(game.models.entitlements.adFree, true);
  assert.deepEqual((await game.controllers.purchases.offers()).permanent, [], 'ya no se ofrece');
  for (let i = 0; i < 12; i++) assert.equal(await playMatch(game, log), false);

  // «Restaurar compras» en una instalación nueva
  const again = fakes();
  again.state.restorable = [{ store: 'apple', productId: NO_ADS, transactionId: '9' }, { store: 'apple', productId: PACK, transactionId: '8' }];
  const reinstalled = createGame(again.services);
  assert.equal(await reinstalled.controllers.purchases.restore(), true);
  assert.equal(count(again.log, 'api:POST/purchases'), 1, 'solo se restauran las compras permanentes');
});

test('compras: el inventario solo cambia con la respuesta del servidor', async () => {
  const { services, log, state } = fakes();
  const game = createGame(services);
  const { purchases } = game.controllers;
  assert.deepEqual((await purchases.offers()).packs, [{ name: 'Pack Inicial', grants: { slow: 3, wide: 2 }, productId: PACK, priceLabel: '$990' }]);

  assert.equal(await purchases.buy(PACK), PurchaseOutcome.DELIVERED);
  assert.deepEqual(game.models.powerUps.all(), { slow: 3 });
  assert.deepEqual(log, ['store:buy:usuario-1', 'api:POST/purchases', 'store:finish:tok']);

  state.storeResult = null;
  assert.equal(await purchases.buy(PACK), PurchaseOutcome.CANCELLED);

  // sin conexión: la compra queda pagada y pendiente, NO se cierra y no se regala nada en la app
  state.storeResult = undefined; state.apiError = new TypeError('sin red'); log.length = 0;
  game.models.powerUps.replace({});
  assert.equal(await purchases.buy(PACK), PurchaseOutcome.PENDING);
  assert.deepEqual(game.models.powerUps.all(), {});
  assert.ok(!log.some((l) => l.startsWith('store:finish')));

  // al volver a abrir la app se recupera sola
  state.apiError = null; state.pending = [{ store: 'apple', productId: PACK, transactionId: '77' }];
  await purchases.recoverPending();
  assert.deepEqual(game.models.powerUps.all(), { slow: 3 });
  assert.equal(log.at(-1), 'store:finish:77');

  // el servidor dice que el recibo no vale: no se entrega nada y se saca de la cola
  state.apiError = new ApiError(422, 'compra_invalida'); game.models.powerUps.replace({});
  assert.equal(await purchases.buy(PACK), PurchaseOutcome.REJECTED);
  assert.deepEqual(game.models.powerUps.all(), {});
});

test('cambiar nombre: avisa sin gastar peticiones y respeta lo que diga el servidor', async () => {
  const { services, log, state } = fakes();
  const game = createGame(services);
  const { profile } = game.controllers;
  assert.equal(await profile.rename('ab'), RenameOutcome.INVALID);
  assert.deepEqual(log, []);

  state.apiError = new ApiError(409, 'nombre_ocupado');
  assert.equal(await profile.rename('Beto'), RenameOutcome.TAKEN);
  state.apiError = null;
  assert.equal(await profile.rename('Anita'), RenameOutcome.CHANGED);
  assert.equal(game.models.profile.displayName, 'Anita');
  log.length = 0;
  assert.equal(await profile.rename('Anota'), RenameOutcome.TOO_SOON, 'ya lo cambió: faltan 30 días');
  assert.deepEqual(log, []);

  // el teléfono cree que puede (reloj adelantado, otro dispositivo…) pero el servidor manda
  const other = createGame(fakes().services);
  other.controllers.profile.api = { async request() { throw new ApiError(429, 'cambio_de_nombre_en_espera', { nextChangeAt: '2099-01-01T00:00:00.000Z' }); } };
  assert.equal(await other.controllers.profile.rename('Anota'), RenameOutcome.TOO_SOON);
  assert.equal(other.models.profile.canChangeName(), false);
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
