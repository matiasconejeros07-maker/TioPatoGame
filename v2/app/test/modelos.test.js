import test from 'node:test';
import assert from 'node:assert/strict';
import { PowerUpInventoryModel, MatchPowerUpsModel, ActivationRefusal } from '../src/models/PowerUpModel.js';
import { AdPolicyModel } from '../src/models/AdPolicyModel.js';
import { ProfileModel } from '../src/models/ProfileModel.js';
import { GameFlowModel, GameState } from '../src/models/GameFlowModel.js';

test('power-ups: duran exactamente 10 segundos', () => {
  const inventory = new PowerUpInventoryModel();
  inventory.replace({ slow: 2 });
  const match = new MatchPowerUpsModel(inventory);
  const events = [];
  match.on('expired', (e) => events.push(e.id));
  assert.deepEqual(match.activate('slow', 1000), { ok: true, endsAt: 11000 });
  assert.equal(inventory.quantity('slow'), 1);
  assert.equal(match.isActive('slow', 10999), true);
  assert.equal(match.remainingMs('slow', 10999), 1);
  assert.equal(match.isActive('slow', 11000), false);
  assert.deepEqual(events, ['slow']);
});

test('power-ups: máximo 3 por partida, solo si quedan, y la partida siguiente parte de cero', () => {
  const inventory = new PowerUpInventoryModel();
  inventory.replace({ slow: 5, freeze: 1, wide: 0 });
  const match = new MatchPowerUpsModel(inventory);
  assert.equal(match.activate('wide', 0).refusal, ActivationRefusal.NONE_LEFT);
  assert.equal(match.activate('turbo', 0).refusal, ActivationRefusal.UNKNOWN);
  assert.equal(match.activate('slow', 0).ok, true);
  assert.equal(match.activate('slow', 5000).refusal, ActivationRefusal.ALREADY_ACTIVE, 'el mismo no se apila');
  assert.equal(match.activate('freeze', 5000).ok, true, 'uno distinto sí puede coincidir');
  assert.equal(match.activate('slow', 10000).ok, true);
  assert.equal(match.remainingThisMatch, 0);
  assert.equal(match.activate('slow', 30000).refusal, ActivationRefusal.MATCH_LIMIT);
  assert.deepEqual(match.used, ['slow', 'freeze', 'slow']);
  assert.deepEqual(inventory.all(), { slow: 3, freeze: 0, wide: 0 }, 'un intento rechazado no gasta nada');
  assert.equal(new MatchPowerUpsModel(inventory).activate('slow', 0).ok, true);
});

test('anuncios: toca uno cada 5 partidas, y si no se pudo mostrar queda pendiente', () => {
  const policy = new AdPolicyModel();
  const due = [];
  for (let match = 1; match <= 12; match++) { policy.recordMatch(); due.push(policy.isDue); if (policy.isDue && match !== 5) policy.recordAdShown(); }
  // partida 5: tocaba pero no se mostró → sigue pendiente en la 6, donde sí sale; el siguiente, 5 partidas después (la 11)
  assert.deepEqual(due, [false, false, false, false, true, true, false, false, false, false, true, false]);
});

test('perfil: sabe si ya puede cambiar el nombre y cuántos días faltan', () => {
  const profile = new ProfileModel();
  assert.equal(profile.canChangeName(), true);
  const now = Date.parse('2026-11-12T12:00:00Z');
  profile.update({ displayName: 'Ana', nextChangeAt: '2026-12-12T12:00:00.000Z' });
  assert.deepEqual([profile.canChangeName(now), profile.daysUntilNameChange(now)], [false, 30]);
  assert.equal(profile.daysUntilNameChange(now + 29.5 * 86_400_000), 1);
  assert.equal(profile.canChangeName(now + 30 * 86_400_000), true);
});

test('estados: no se puede saltar a un anuncio desde una partida en curso', () => {
  const flow = new GameFlowModel();
  flow.go(GameState.MENU);
  flow.go(GameState.PLAYING);
  assert.equal(flow.canGo(GameState.AD_BREAK), false);
  assert.throws(() => flow.go(GameState.AD_BREAK));
  flow.go(GameState.GAME_OVER);
  assert.equal(flow.canGo(GameState.AD_BREAK), true);
});
