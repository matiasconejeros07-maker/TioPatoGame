// Anuncios, compras, perfil y flujo del juego: toda la lógica vive en los controladores.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, createPracticeGame } from '../src/composition.js';
import { GameState } from '../src/models/GameFlowModel.js';
import { PurchaseOutcome } from '../src/controllers/PurchaseController.js';
import { RenameOutcome } from '../src/controllers/ProfileController.js';
import { ApiClient, ApiError } from '../src/services/ApiClient.js';
import { verify } from '../../shared/signature.js';
import { fakes, playMatch, count, PACK, NO_ADS } from '../testing/apoyo.js';

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

test('estados: no hay camino de una partida en curso a un anuncio', async () => {
  const { services, log } = fakes();
  const game = createGame(services);
  const { flow } = game.controllers;
  await flow.boot();
  flow.startMatch();
  assert.equal(flow.canGo(GameState.AD_BREAK), false);
  await flow.leaveGameOver();                       // alguien intenta «salir del resumen» en plena partida
  assert.equal(game.models.flow.state, GameState.PLAYING);
  assert.equal(count(log, 'ads:show'), 0);
  assert.throws(() => flow.startMatch(), /no permitida/, 'tampoco se puede empezar otra partida encima');
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
});

test('anuncios: si no hay anuncio cargado o AdMob falla, el juego sigue y el anuncio queda pendiente', async () => {
  const { services, log, state } = fakes();
  state.adLoads = false;
  const game = createGame(services);
  await game.controllers.flow.boot();
  for (let i = 0; i < 6; i++) assert.equal(await playMatch(game, log), false);
  assert.equal(game.controllers.ads.isDue, true);
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
  assert.ok(!paid.log.some((l) => l === 'consent' || l.startsWith('ads:')));

  const { services, log } = fakes();
  const game = createGame(services);
  await game.controllers.flow.boot();
  for (let i = 0; i < 4; i++) await playMatch(game, log);
  assert.deepEqual((await game.controllers.purchases.offers()).permanent.map((o) => o.name), ['Sin anuncios']);
  assert.equal(await game.controllers.purchases.buy(NO_ADS), PurchaseOutcome.DELIVERED);
  assert.equal(game.controllers.ads.adFree, true);
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
  game.models.session.current = { id: 's', key: new Uint8Array(1), userId: 'usuario-1' };
  const { purchases } = game.controllers;
  const inventory = game.models.powerUps;
  assert.deepEqual((await purchases.offers()).packs, [{ name: 'Pack Inicial', grants: { slow: 3, wide: 2 }, productId: PACK, priceLabel: '$990' }]);

  assert.equal(await purchases.buy(PACK), PurchaseOutcome.DELIVERED);
  assert.deepEqual(inventory.quantities, { slow: 3 });
  assert.deepEqual(log, ['store:buy:usuario-1', 'api:POST/purchases', 'store:finish:tok']);

  state.storeResult = null;
  assert.equal(await purchases.buy(PACK), PurchaseOutcome.CANCELLED);

  // sin conexión: la compra queda pagada y pendiente, NO se cierra y no se regala nada en la app
  state.storeResult = undefined; state.apiError = new TypeError('sin red'); log.length = 0;
  inventory.quantities = {};
  assert.equal(await purchases.buy(PACK), PurchaseOutcome.PENDING);
  assert.deepEqual(inventory.quantities, {});
  assert.ok(!log.some((l) => l.startsWith('store:finish')));

  // al volver a abrir la app se recupera sola
  state.apiError = null; state.pending = [{ store: 'apple', productId: PACK, transactionId: '77' }];
  await purchases.recoverPending();
  assert.deepEqual(inventory.quantities, { slow: 3 });
  assert.equal(log.at(-1), 'store:finish:77');

  // el servidor dice que el recibo no vale: no se entrega nada y se saca de la cola
  state.apiError = new ApiError(422, 'compra_invalida'); inventory.quantities = {};
  assert.equal(await purchases.buy(PACK), PurchaseOutcome.REJECTED);
  assert.deepEqual(inventory.quantities, {});

  // un power-up con pesos del juego
  state.apiError = null;
  assert.deepEqual(await purchases.buyWithCoins('freeze'), { ok: true, balance: 250_000 });
  assert.equal(inventory.quantities.freeze, 1);
  state.apiError = new ApiError(409, 'saldo_insuficiente');
  assert.deepEqual(await purchases.buyWithCoins('freeze'), { ok: false, reason: 'saldo_insuficiente' });
});

test('cambiar nombre: avisa sin gastar peticiones (también las groserías) y respeta lo que diga el servidor', async () => {
  const { services, log, state } = fakes();
  const game = createGame(services);
  const { profile } = game.controllers;
  assert.equal(await profile.rename('ab'), RenameOutcome.INVALID);
  assert.equal(await profile.rename('El Weón'), RenameOutcome.OFFENSIVE);
  assert.deepEqual(log, []);

  state.apiError = new ApiError(409, 'nombre_ocupado');
  assert.equal(await profile.rename('Beto'), RenameOutcome.TAKEN);
  state.apiError = new ApiError(422, 'nombre_ofensivo');           // el servidor puede tener una lista más nueva que la app
  assert.equal(await profile.rename('Beto'), RenameOutcome.OFFENSIVE);
  state.apiError = null;
  assert.equal(await profile.rename('Anita'), RenameOutcome.CHANGED);
  assert.equal(game.models.profile.displayName, 'Anita');
  log.length = 0;
  assert.equal(await profile.rename('Anota'), RenameOutcome.TOO_SOON, 'ya lo cambió: faltan 30 días');
  assert.deepEqual(log, []);

  // el teléfono cree que puede (reloj adelantado, otro dispositivo…) pero el servidor manda
  const other = createGame(fakes().services);
  const now = Date.parse('2026-11-12T12:00:00Z');
  other.controllers.profile.now = () => now;
  other.controllers.profile.api = { async request() { throw new ApiError(429, 'cambio_de_nombre_en_espera', { nextChangeAt: '2026-12-12T12:00:00.000Z' }); } };
  assert.equal(await other.controllers.profile.rename('Anota'), RenameOutcome.TOO_SOON);
  assert.deepEqual([other.controllers.profile.canChangeName, other.controllers.profile.daysUntilNameChange], [false, 30]);

  assert.equal(await profile.saveVipContact('+56912345678', true), true);
  assert.equal(log.at(-1), 'api:PUT/account/vip');
});

test('versión web: Modo Práctica. Se juega, pero sin cuenta, tienda, anuncios ni contacto con el servidor', async () => {
  const game = createPracticeGame({ requestFrame: () => {} });
  assert.equal(game.models.session.practice, true);
  assert.equal(game.models.session.current, null);
  assert.deepEqual(Object.keys(game.controllers), ['flow', 'match', 'audio'], 'no existen los controladores de cuenta, compras ni marcadores');
  await game.controllers.flow.boot();
  for (let i = 0; i < 6; i++) { game.controllers.flow.startMatch(); game.controllers.flow.endMatch(); await game.controllers.flow.leaveGameOver(); }
  assert.equal(game.models.flow.state, GameState.MENU);
  assert.match(game.storeLinks.android, /play\.google\.com/);
  assert.match(game.storeLinks.ios, /apps\.apple\.com/);
});

test('ApiClient: firma cada petición y corrige el reloj del teléfono si está corrido', async () => {
  const key = new Uint8Array(32).fill(7);
  const serverNow = 1_800_000_100_000, phoneNow = 1_800_000_000_000;      // el teléfono va 100 s atrasado
  const seen = [];
  const api = new ApiClient({
    baseUrl: 'https://api.ejemplo', now: () => phoneNow, getSession: async () => ({ id: 'sesion-1', key }),
    fetch: async (url, init = {}) => {
      if (url.endsWith('/health')) return Response.json({ ok: true, now: serverNow });
      if (url.endsWith('/auth/challenge')) return Response.json({ challenge: 'reto', firmado: 'x-signature' in init.headers });
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
  assert.deepEqual(await api.open('/auth/challenge'), { challenge: 'reto', firmado: false }, 'el inicio de sesión va sin firma: aún no hay clave');
  await assert.rejects(new ApiClient({ baseUrl: '', getSession: async () => null }).request('GET', '/x'), (e) => e.code === 'sin_sesion');
});
