// La física de la partida, sin navegador: se avanza el reloj a mano con MatchController.advance().
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, createPracticeGame } from '../src/composition.js';
import { MatchPhase } from '../src/models/MatchModel.js';
import { GameState } from '../src/models/GameFlowModel.js';
import { matchEarnings, hitValue } from '../../shared/store.js';
import { fakes, settle } from '../testing/apoyo.js';

/** Juega con un «jugador» que pone la barra bajo la pelota hasta `untilHits` rebotes (o hasta `maxSeconds`). */
function play(game, { untilHits = Infinity, maxSeconds = 600, follow = true } = {}) {
  const { match: ctl } = game.controllers, m = game.models.match;
  for (let t = 0; t < maxSeconds && m.phase !== MatchPhase.OVER && m.hits < untilHits; t += 1 / 120) { if (follow) ctl.movePaddleTo(m.ballX); ctl.advance(1 / 120); }
  return m;
}
async function newMatch(mode = 'classic', setup = () => {}) {
  const f = fakes({ owned: { powerups: { slow: 2, wide: 2 }, entitlements: [] } });
  const game = createGame(f.services);
  setup(game);
  await game.controllers.flow.boot();
  game.controllers.match.resize(390, 844);
  game.controllers.flow.startMatch(mode);
  await settle();
  return { ...f, game };
}

test('partida: cuenta regresiva de 3 s, la pelota sale del personaje y nunca se escapa de la cancha', async () => {
  const { game } = await newMatch();
  const m = game.models.match, ctl = game.controllers.match;
  assert.equal(m.phase, MatchPhase.COUNTDOWN);
  for (let i = 0; i < 2.9 * 120; i++) ctl.advance(1 / 120);
  assert.equal(m.phase, MatchPhase.COUNTDOWN);
  for (let i = 0; i < 0.2 * 120; i++) ctl.advance(1 / 120);
  assert.equal(m.phase, MatchPhase.PLAYING);
  let minX = Infinity, maxX = -Infinity, minY = Infinity;
  for (let t = 0; t < 40 && m.phase === MatchPhase.PLAYING; t += 1 / 120) { ctl.movePaddleTo(m.ballX); ctl.advance(1 / 120); minX = Math.min(minX, m.ballX); maxX = Math.max(maxX, m.ballX); minY = Math.min(minY, m.ballY); }
  assert.ok(minX >= 28 && maxX <= 390 - 28, `la moneda no sale por los lados (${minX.toFixed(1)} a ${maxX.toFixed(1)})`);
  assert.ok(minY >= m.duckBottom, 'el personaje siempre la devuelve: nada pasa por arriba');
  assert.ok(m.hits > 10, `con la barra bajo la pelota se rebota siempre (${m.hits})`);
});

test('partida: dificultad de la V1 (barra que se achica, pelota que acelera) y pago por rebote', async () => {
  const { game } = await newMatch();
  const m = game.models.match;
  const startWidth = m.paddleWidth;
  assert.ok(Math.abs(startWidth - (390 * 0.42 + 2 * 16.8 - 2 * 16.8)) < 1.5, `barra inicial de la moneda ≈ 164 px (${startWidth.toFixed(1)})`);
  play(game, { untilHits: 100 });
  assert.equal(m.hits, 100);
  assert.ok(Math.abs(m.paddleWidth / startWidth - 0.7) < 0.02, `en el rebote 100 la barra mide el 70% (${(m.paddleWidth / startWidth).toFixed(3)})`);
  assert.equal(m.earned, matchEarnings(1, 100));
  assert.equal(m.earned, 99 + 2, 'monedas dobles: el rebote 100 vale $2');
  assert.equal(hitValue(5000, 120), 10000, 'el diamante en el rebote 120 paga $10.000');
  assert.equal(m.angry, true, 'el personaje se enojó en el rebote 55');
  assert.equal(m.stage, 5);
  const speed = Math.hypot(m.velX, m.velY / 1);       // en 390×844 la vertical no se estira
  // V1: 1.200 px/s de base en el rebote 100 × 0,95 (alivio hasta el 100) × 1,106 (escala de la cancha de 844 de alto)
  assert.ok(Math.abs(speed - 1200 * 0.95 * (844 - 280) / 510) < 15, `rapidez de la V1 en el rebote 100 (${speed.toFixed(0)})`);
});

test('partida: si no mueves la barra pierdes, se informa al servidor y el flujo pasa al resumen', async () => {
  const { game, log } = await newMatch();
  const m = play(game, { follow: false, maxSeconds: 60 });
  game.controllers.match.movePaddleTo(0);
  play(game, { follow: false, maxSeconds: 60 });
  assert.equal(m.phase, MatchPhase.OVER);
  assert.equal(game.models.flow.state, GameState.GAME_OVER);
  await settle();
  assert.ok(log.some((l) => l === 'api:POST/matches/partida-1/finish'));
});

test('partida: las burbujas gratis salen en el rebote 20 y su efecto dura 10 segundos', async () => {
  const { game } = await newMatch();
  const m = game.models.match, ctl = game.controllers.match;
  play(game, { untilHits: 19 });
  assert.equal(m.bubble, null, 'antes del rebote 20 no hay burbuja');
  play(game, { untilHits: 20 }); ctl.advance(1 / 120);
  assert.ok(m.bubble && ['slow', 'freeze', 'wide'].includes(m.bubble.type));
  // la pelota la toca: se enciende el efecto
  m.bubble = { ...m.bubble, type: 'wide', x: m.ballX, y: m.ballY };
  const before = m.paddleWidth;
  ctl.advance(1 / 120);
  assert.equal(m.bubble, null);
  assert.ok(m.effects.wide > 9.9 && m.paddleWidth > before * 1.3, 'barra grande: un 50% más de zona de golpe');
  for (let t = 0; t < 9.8; t += 1 / 60) { ctl.movePaddleTo(m.ballX); ctl.advance(1 / 60); }
  assert.ok(m.effects.wide > 0);
  for (let t = 0; t < 0.4; t += 1 / 60) { ctl.movePaddleTo(m.ballX); ctl.advance(1 / 60); }
  assert.equal(m.effects.wide, undefined, 'a los 10 segundos se apaga');
});

test('partida arcade: un power-up de pago frena la pelota 10 segundos del reloj de la partida; en clásico no se puede', async () => {
  const { game } = await newMatch('arcade');
  const m = game.models.match, ctl = game.controllers.match;
  play(game, { untilHits: 3 });
  const travel = (seconds) => { let d = 0; for (let t = 0; t < seconds; t += 1 / 240) { const x = m.ballX, y = m.ballY; ctl.movePaddleTo(m.ballX); ctl.advance(1 / 240); d += Math.hypot(m.ballX - x, m.ballY - y); } return d; };
  const normal = travel(0.5);
  assert.deepEqual(ctl.activatePowerUp('slow'), { ok: true, endsAt: ctl.clock + 10000 });
  const slowed = travel(0.5);
  assert.ok(slowed / normal > 0.5 && slowed / normal < 0.72, `la pelota va al 60% (${(slowed / normal).toFixed(2)})`);
  assert.equal(game.models.powerUps.quantities.slow, 1);

  const classic = await newMatch('classic');
  play(classic.game, { untilHits: 2 });
  assert.equal(classic.game.controllers.match.activatePowerUp('slow').refusal, 'classic_mode');
});

test('Modo Práctica: se juega una partida completa sin tocar la red y sin sumar nada', async () => {
  const game = createPracticeGame({ requestFrame: () => {} });
  await game.controllers.flow.boot();
  game.controllers.match.resize(390, 844);
  game.controllers.flow.startMatch();
  const m = play(game, { untilHits: 12 });
  assert.equal(m.hits, 12);
  game.controllers.match.abandon();
  assert.deepEqual(game.models.result.last, { hits: 12, mode: 'classic', seconds: game.models.result.last.seconds, earned: 0, isRecord: false, best: 0, saved: true });
});
