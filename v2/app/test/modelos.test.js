import test from 'node:test';
import assert from 'node:assert/strict';
import { PowerUpInventoryModel, MatchPowerUpsModel, ActivationRefusal } from '../src/models/PowerUpModel.js';
import { AdPolicyModel } from '../src/models/AdPolicyModel.js';
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

test('anuncios: nunca en las primeras partidas, ni seguidos, ni tras una partida muy corta', () => {
  const policy = new AdPolicyModel();
  const minute = 60_000;
  const play = (now, lastMatchMs = 40_000) => { policy.recordMatch(); return policy.shouldShow({ now, lastMatchMs }); };
  assert.deepEqual([play(1 * minute), play(2 * minute)], [false, false], 'partidas de gracia');
  assert.equal(play(3 * minute, 5_000), false, 'partida de 5 s: sin anuncio');
  assert.equal(play(4 * minute), true);
  policy.recordAdShown(4 * minute);
  assert.deepEqual([play(4.2 * minute), play(4.4 * minute)], [false, false], 'faltan partidas');
  assert.equal(play(4.6 * minute), false, 'ya van 3 partidas pero no han pasado 2,5 minutos');
  assert.equal(play(7 * minute), true);
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
