// Inicio de sesión, Device Binding y cambio de teléfono, de punta a punta contra PostgreSQL.
// (El SSO y la atestación son dobles aquí; sus verificadores reales se prueban en seguridad.test.js.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { b64urlDecode } from '../src/services/jwt.js';
import { setup, skip } from '../testing/setup.js';

/** Un intento de inicio de sesión completo, como lo hace la app. */
async function login(ctx, { platform = 'android', person, device, ...extra }) {
  const { json: { challenge } } = await ctx.post('/auth/challenge', {});
  return ctx.post('/auth/login', { platform, challenge, identity: { token: 'sub:' + person }, attestation: { device, ...extra.attestation }, confirmDeviceChange: extra.confirm });
}

test('inicio de sesión: crea la cuenta, entrega una clave de sesión que firma peticiones y la sesión anterior deja de servir', { skip }, async (t) => {
  const ctx = await setup(t);
  const first = await login(ctx, { person: 'ana', device: 'tel-1' });
  assert.equal(first.status, 200);
  assert.equal(first.json.isNew, true);
  assert.match(first.json.displayName, /^Pato\d{9}$/);
  const call = ctx.client(first.json.sessionId, b64urlDecode(first.json.sessionKey));
  assert.deepEqual((await call('GET', '/purchases')).json, { powerups: {}, entitlements: [] });
  assert.equal((await call('PUT', '/account/name', { name: 'Ana' })).status, 200, 'el primer nombre se elige de inmediato');

  const again = await login(ctx, { person: 'ana', device: 'tel-1' });
  assert.deepEqual([again.json.isNew, again.json.userId, again.json.displayName], [false, first.json.userId, 'Ana']);
  assert.equal((await call('GET', '/purchases')).json.error, 'sesion_invalida', 'una sola sesión viva por cuenta');
  assert.equal((await ctx.sql`SELECT count(*)::int AS n FROM users`)[0].n, 1);
});

test('inicio de sesión: se rechaza sin desafío propio, con el desafío repetido, con root o con una identidad falsa', { skip }, async (t) => {
  const ctx = await setup(t);
  const attempt = (over) => ctx.post('/auth/login', { platform: 'ios', challenge: 'x'.repeat(43), identity: { token: 'sub:ana' }, attestation: { device: 'tel-1' }, ...over });
  assert.equal((await attempt({})).json.error, 'desafio_invalido', 'un desafío inventado no vale');

  const { json: { challenge } } = await ctx.post('/auth/challenge', {});
  assert.equal((await attempt({ challenge })).status, 200);
  assert.equal((await attempt({ challenge })).json.error, 'desafio_invalido', 'cada desafío sirve una sola vez');

  const rooted = await login(ctx, { person: 'beto', device: 'tel-2', attestation: { rooted: true } });
  assert.deepEqual([rooted.status, rooted.json], [403, { error: 'dispositivo_no_confiable' }], 'no se le explica al atacante qué falló');
  const fresh = (await ctx.post('/auth/challenge', {})).json.challenge;
  assert.equal((await attempt({ challenge: fresh, identity: { token: 'falso' }, attestation: { device: 'tel-3' } })).json.error, 'identidad_invalida');
  assert.equal((await ctx.post('/auth/login', { platform: 'web', challenge: fresh })).status, 400, 'la web no inicia sesión');
  assert.equal((await ctx.sql`SELECT count(*)::int AS n FROM users`)[0].n, 1);
});

test('Device Binding: un teléfono = una cuenta (no se pueden crear multicuentas en el mismo equipo)', { skip }, async (t) => {
  const ctx = await setup(t);
  const ana = await login(ctx, { person: 'ana', device: 'tel-1' });
  const second = await login(ctx, { person: 'cuenta-dos', device: 'tel-1' });
  assert.deepEqual([second.status, second.json.error], [409, 'dispositivo_con_otra_cuenta']);
  assert.equal((await ctx.sql`SELECT count(*)::int AS n FROM users`)[0].n, 1, 'la segunda cuenta ni siquiera se crea');

  // otra persona con cuenta propia tampoco puede entrar en el teléfono de Ana
  const beto = await login(ctx, { person: 'beto', device: 'tel-2' });
  assert.equal((await login(ctx, { person: 'beto', device: 'tel-1', confirm: true })).json.error, 'dispositivo_con_otra_cuenta');
  assert.notEqual(ana.json.userId, beto.json.userId);

  // dos intentos a la vez con identidades nuevas en un teléfono nuevo: gana uno solo
  const race = await Promise.all([login(ctx, { person: 'c1', device: 'tel-9' }), login(ctx, { person: 'c2', device: 'tel-9' })]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
});

test('cambio de teléfono: pide confirmación, cierra el teléfono viejo y solo se puede una vez cada 30 días', { skip }, async (t) => {
  const ctx = await setup(t);
  const { sql } = ctx;
  const old = await login(ctx, { person: 'ana', device: 'tel-viejo' });
  const oldCall = ctx.client(old.json.sessionId, b64urlDecode(old.json.sessionKey));

  const warn = await login(ctx, { person: 'ana', device: 'tel-nuevo' });
  assert.deepEqual([warn.status, warn.json.error], [409, 'confirmar_cambio_de_dispositivo']);
  assert.equal((await oldCall('GET', '/purchases')).status, 200, 'sin confirmar no cambia nada');

  const moved = await login(ctx, { person: 'ana', device: 'tel-nuevo', confirm: true });
  assert.deepEqual([moved.status, moved.json.userId], [200, old.json.userId]);
  assert.equal((await oldCall('GET', '/purchases')).status, 401, 'el teléfono viejo queda fuera');
  assert.deepEqual((await sql`SELECT hardware_id FROM devices`).map((d) => d.hardware_id), ['android:tel-nuevo']);

  // el teléfono viejo quedó libre… pero Ana no puede volver a él (ni a un tercero) antes de 30 días
  const back = await login(ctx, { person: 'ana', device: 'tel-viejo', confirm: true });
  assert.deepEqual([back.status, back.json.error], [429, 'cambio_de_dispositivo_en_espera']);
  const days = (new Date(back.json.nextChangeAt) - Date.now()) / 86_400_000;
  assert.ok(days > 29.99 && days < 30.01);
  assert.equal((await login(ctx, { person: 'ana', device: 'tel-nuevo' })).status, 200, 'en su teléfono actual entra normal');

  await sql`UPDATE users SET device_changed_at = now() - interval '29 days'`;
  assert.equal((await login(ctx, { person: 'ana', device: 'tel-tercero', confirm: true })).status, 429);
  await sql`UPDATE users SET device_changed_at = now() - interval '30 days'`;
  assert.equal((await login(ctx, { person: 'ana', device: 'tel-tercero', confirm: true })).status, 200);
  assert.equal((await sql`SELECT count(*)::int AS n FROM devices`)[0].n, 1, 'siempre un solo teléfono activo por cuenta');
});

test('eliminar cuenta: revoca «Iniciar sesión con Apple» y deja el teléfono libre para empezar de nuevo', { skip }, async (t) => {
  const ctx = await setup(t);
  const ana = await login(ctx, { platform: 'ios', person: 'ana', device: 'iphone-1' });
  const [identity] = await ctx.sql`SELECT refresh_token_enc FROM identities`;
  assert.ok(identity.refresh_token_enc && !identity.refresh_token_enc.includes('refresh-ana'), 'el refresh token se guarda cifrado');
  const call = ctx.client(ana.json.sessionId, b64urlDecode(ana.json.sessionKey));
  assert.equal((await call('DELETE', '/account')).status, 204);
  assert.deepEqual(ctx.revokedTokens, ['refresh-ana']);
  const again = await login(ctx, { platform: 'ios', person: 'ana', device: 'iphone-1' });
  assert.deepEqual([again.status, again.json.isNew], [200, true]);
});

test('límite de intentos: más de 20 por minuto desde una IP se frenan', { skip }, async (t) => {
  const ctx = await setup(t);
  const statuses = [];
  for (let i = 0; i < 22; i++) statuses.push((await ctx.post('/auth/challenge', {})).status);
  assert.deepEqual([statuses.slice(0, 20).every((s) => s === 200), statuses[20], statuses[21]], [true, 429, 429]);
  assert.equal((await ctx.post('/auth/challenge', {}, { 'cf-connecting-ip': '198.51.100.9' })).status, 200, 'otra IP no se ve afectada');
  ctx.clock.now += 61_000;
  assert.equal((await ctx.post('/auth/challenge', {})).status, 200);
});
