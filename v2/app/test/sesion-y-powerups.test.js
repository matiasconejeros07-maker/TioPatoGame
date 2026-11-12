// Inicio de sesión (SSO + atestación + cambio de teléfono) y power-ups en la partida.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/composition.js';
import { SignInOutcome } from '../src/controllers/AuthController.js';
import { ActivationRefusal } from '../src/controllers/PowerUpController.js';
import { fakes, settle, count } from '../testing/apoyo.js';

test('inicio de sesión: pide un desafío, junta atestación y SSO, y guarda la sesión en el almacén seguro', async () => {
  const { services, log, state } = fakes();
  const game = createGame(services);
  const { auth } = game.controllers;
  assert.equal(await auth.restore(), false);

  assert.deepEqual(await auth.signIn(), { outcome: SignInOutcome.SIGNED_IN, isNew: true, hasLegacyAccount: false });
  assert.deepEqual(log, ['api:open/auth/challenge', 'attest', 'sso', 'api:open/auth/login']);
  assert.deepEqual(state.lastLogin, { platform: 'android', challenge: 'reto-1', identity: { serverAuthCode: 'codigo-para-reto-1' },
    attestation: { integrityToken: 'token-para-reto-1', deviceId: 'abc' }, confirmDeviceChange: false }, 'todo atado al mismo desafío');
  assert.deepEqual([...state.saved.key], [1, 2, 3]);
  assert.equal(game.models.session.current.userId, 'usuario-1');
  assert.equal(game.models.profile.displayName, 'Pato000000001');

  // la próxima vez que se abre la app no hace falta iniciar sesión
  const reopened = createGame(services);
  assert.equal(await reopened.controllers.auth.restore(), true);
  await auth.signOut();
  assert.deepEqual([state.saved, auth.signedIn], [null, false]);
});

test('inicio de sesión: cada respuesta del servidor llega a la vista como un resultado claro', async () => {
  const run = async (login, extra = {}) => { const f = fakes(); Object.assign(f.state, { login }, extra); const game = createGame(f.services); return { result: await game.controllers.auth.signIn(extra.options), ...f, game }; };

  assert.equal((await run({ status: 409, error: 'dispositivo_con_otra_cuenta' })).result.outcome, SignInOutcome.DEVICE_HAS_ACCOUNT);
  assert.equal((await run({ status: 403, error: 'dispositivo_no_confiable' })).result.outcome, SignInOutcome.UNTRUSTED_DEVICE);
  assert.deepEqual((await run({ status: 429, error: 'cambio_de_dispositivo_en_espera', nextChangeAt: '2026-12-01T00:00:00.000Z' })).result,
    { outcome: SignInOutcome.DEVICE_CHANGE_WAIT, nextChangeAt: '2026-12-01T00:00:00.000Z' });
  assert.equal((await run({ status: 200 }, { cancelSso: true })).result.outcome, SignInOutcome.CANCELLED);
  const offline = await run({ status: 200 }, { offline: true });
  assert.deepEqual([offline.result.outcome, offline.state.saved], [SignInOutcome.FAILED, null]);

  // cambio de teléfono: primero avisa; solo con la confirmación del jugador se manda confirmDeviceChange
  const moving = await run([{ status: 409, error: 'confirmar_cambio_de_dispositivo' }, { status: 200, isNew: false }]);
  assert.equal(moving.result.outcome, SignInOutcome.CONFIRM_DEVICE_CHANGE);
  assert.equal(moving.state.lastLogin.confirmDeviceChange, false);
  assert.equal((await moving.game.controllers.auth.signIn({ confirmDeviceChange: true })).outcome, SignInOutcome.SIGNED_IN);
  assert.deepEqual([moving.state.lastLogin.confirmDeviceChange, moving.state.lastLogin.challenge], [true, 'reto-2'], 'cada intento usa un desafío nuevo');
});

test('inicio de sesión en iOS: si el servidor ya no conoce la clave del teléfono, se crea una nueva y se reintenta una vez', async () => {
  const { services, log, state } = fakes();
  services.attestation.canRenew = true;
  state.login = [{ status: 403, error: 'dispositivo_no_confiable' }, { status: 200 }];
  const game = createGame(services);
  assert.equal((await game.controllers.auth.signIn()).outcome, SignInOutcome.SIGNED_IN);
  assert.deepEqual(log.filter((l) => l.startsWith('attest')), ['attest', 'attest:renew']);
});

test('cuenta de la V1: se recupera con el nombre y la contraseña de siempre', async () => {
  const { services, log, state } = fakes();
  const game = createGame(services);
  const { auth } = game.controllers;
  await auth.signIn();
  assert.equal(await auth.linkLegacyAccount('Ana', 'equivocada'), 'wrong_password');
  assert.ok(!log.includes('api:POST/account/link-legacy'), 'una contraseña mala ni llega al servidor');
  assert.equal(await auth.linkLegacyAccount('Ana', 'correcta'), 'linked');
  assert.deepEqual([game.models.session.current.userId, state.saved.userId, state.saved.id], ['usuario-antiguo', 'usuario-antiguo', 'sesion-1'], 'misma sesión, ahora de la cuenta antigua');
});

async function arcadeMatch(owned = { slow: 5, freeze: 1, wide: 0 }, mode = 'arcade') {
  const f = fakes({ owned: { powerups: owned, entitlements: [] } });
  const game = createGame(f.services);
  await game.controllers.flow.boot();
  game.controllers.flow.startMatch(mode);
  await settle();
  return { ...f, game, powerUps: game.controllers.powerUps, inventory: game.models.powerUps };
}

test('power-ups: duran exactamente 10 segundos y se descuentan en el servidor al activarlos', async () => {
  const { powerUps, inventory, log } = await arcadeMatch();
  const events = [];
  powerUps.match.on('expired', (e) => events.push(e.id));
  assert.deepEqual(powerUps.activate('slow', 1000), { ok: true, endsAt: 11000 });
  assert.equal(inventory.quantities.slow, 4, 'baja al instante en pantalla');
  await settle();
  assert.equal(count(log, 'api:POST/matches/partida-1/powerups'), 1);
  assert.equal(inventory.quantities.slow, 4, 'y coincide con lo que dice el servidor');
  assert.equal(powerUps.isActive('slow', 10999), true);
  assert.equal(powerUps.remainingMs('slow', 10999), 1);
  assert.equal(powerUps.isActive('slow', 11000), false);
  assert.deepEqual(events, ['slow']);
});

test('power-ups: máximo 3 por partida, solo si quedan, y la partida siguiente parte de cero', async () => {
  const { game, powerUps, inventory } = await arcadeMatch();
  assert.equal(powerUps.activate('wide', 0).refusal, ActivationRefusal.NONE_LEFT);
  assert.equal(powerUps.activate('turbo', 0).refusal, ActivationRefusal.UNKNOWN);
  assert.equal(powerUps.activate('slow', 0).ok, true);
  assert.equal(powerUps.activate('slow', 5000).refusal, ActivationRefusal.ALREADY_ACTIVE, 'el mismo no se apila');
  assert.equal(powerUps.activate('freeze', 5000).ok, true, 'uno distinto sí puede coincidir');
  assert.equal(powerUps.activate('slow', 10000).ok, true);
  assert.equal(powerUps.remainingThisMatch, 0);
  assert.equal(powerUps.activate('slow', 30000).refusal, ActivationRefusal.MATCH_LIMIT);
  assert.deepEqual(powerUps.match.used, ['slow', 'freeze', 'slow']);
  await settle();
  assert.deepEqual(inventory.quantities, { slow: 3, freeze: 0, wide: 0 }, 'un intento rechazado no gasta nada');

  game.controllers.flow.endMatch();
  await game.controllers.flow.leaveGameOver('playing');
  await settle();
  assert.equal(powerUps.remainingThisMatch, 3);
  assert.equal(powerUps.activate('slow', 0).ok, true);
});

test('power-ups: en el ranking clásico están desactivados', async () => {
  const { powerUps, inventory, log } = await arcadeMatch({ slow: 5 }, 'classic');
  assert.deepEqual(powerUps.activate('slow', 0), { ok: false, refusal: ActivationRefusal.CLASSIC_MODE });
  await settle();
  assert.equal(inventory.quantities.slow, 5);
  assert.ok(!log.some((l) => l.endsWith('/powerups')));
});

test('power-ups: si el servidor no acepta el uso (o no hay conexión), el efecto se apaga y el power-up vuelve', async () => {
  const rejected = await arcadeMatch({ slow: 2 });
  rejected.state.serverRejectsPowerUps = true;
  const events = [];
  rejected.powerUps.match.on('expired', (e) => events.push(e));
  assert.equal(rejected.powerUps.activate('slow', 0).ok, true);
  await settle();
  assert.deepEqual([rejected.inventory.quantities.slow, rejected.powerUps.isActive('slow', 1), rejected.powerUps.remainingThisMatch], [2, false, 3]);
  assert.deepEqual(events, [{ id: 'slow', cancelled: true }]);

  const offline = fakes({ owned: { powerups: { slow: 2 }, entitlements: [] } });
  const game = createGame(offline.services);
  await game.controllers.flow.boot();
  offline.state.offline = true;                       // se corta internet antes de empezar la partida
  game.controllers.flow.startMatch('arcade');
  await settle();
  game.controllers.powerUps.activate('slow', 0);
  await settle();
  assert.equal(game.models.powerUps.quantities.slow, 2);
});
