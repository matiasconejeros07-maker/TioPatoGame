import test from 'node:test';
import assert from 'node:assert/strict';
import { transform } from '../transformar.js';
import { load, MigrationError } from '../cargar.js';
import { leaderboardCommands } from '../marcadores.js';
import { createTestDatabase, hasDatabase } from '../../test-support/db.js';
import { rtdb, authUsers } from '../ejemplo/datos.js';

test('transformar: cada cuenta de Firebase sale una vez, con todo lo suyo', () => {
  const { users, anomalies, totals } = transform(rtdb, authUsers);
  assert.deepEqual(anomalies, []);
  assert.deepEqual(users.map((u) => u.firebaseUid), ['uidAna', 'uidBeto', 'uidNueva']);
  const [ana, beto, nueva] = users;
  assert.equal(ana.nameKey, 'ana');
  assert.equal(ana.legacyEmail, null, 'el correo interno no es un correo real');
  assert.equal(ana.role, 'dev');
  assert.deepEqual(ana.wallet, { earned: 9000, spent: 2500, lastRun: 1766000000000 });
  assert.equal(beto.nameKey, 'beto.cl');
  assert.equal(beto.legacyEmail, 'beto@correo.cl');
  assert.equal(beto.goldenFrame, true);
  assert.equal(beto.streak.days, 31);
  assert.deepEqual([beto.streak.x3, beto.streak.x4, beto.streak.y2, beto.streak.boostMult], [1, 2, 1, 3]);
  assert.equal(beto.inventory.find((i) => i.itemId === 'ch_millonario').acquiredAt.getTime(), 1765000000000);
  assert.deepEqual(beto.periodScores, [{ kind: 'w', period: 2950, best: 300 }, { kind: 'm', period: 202611, best: 431 }]);
  assert.equal(nueva.displayName, 'Jugador');
  assert.deepEqual(nueva.wallet, { earned: 0, spent: 0, lastRun: null });
  assert.equal(totals.earned, 250009000);
  assert.equal(totals.streakDays, 40);
  assert.equal(ana.snapshot.runs.h, 120, 'la copia íntegra guarda también lo que no tiene tabla propia');
});

test('transformar: avisa de saldos imposibles y de nombres repetidos', () => {
  const broken = structuredClone(rtdb);
  broken.wallets.uidAna.sp = 99999;
  broken.scores.uidBeto.k = 'ana';
  const { users, anomalies } = transform(broken, authUsers);
  assert.equal(anomalies.length, 2);
  assert.equal(users[0].nameKey, 'ana', 'el nombre se lo queda quien figura en names/');
  assert.equal(users[1].nameKey, null);
});

test('cargar: todo llega a PostgreSQL, se puede repetir y no pisa las cuentas ya enlazadas', { skip: !hasDatabase && 'falta TEST_DATABASE_URL' }, async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.drop());
  const { sql } = db;
  const data = transform(rtdb, authUsers);

  const first = await load(sql, data);
  assert.equal(first.imported, 3);
  assert.deepEqual(first.totals, data.totals);

  const [beto] = await sql`
    SELECT u.id, u.status, u.golden_frame, w.earned - w.spent AS balance, s.days, s.streak_x4, sc.best, sc.mode, u.played_ms
    FROM users u JOIN wallets w ON w.user_id = u.id JOIN streaks s ON s.user_id = u.id JOIN scores sc ON sc.user_id = u.id
    WHERE u.firebase_uid = 'uidBeto'`;
  assert.equal(beto.status, 'legacy_unclaimed');
  assert.equal(Number(beto.balance), 149500000);
  assert.deepEqual([beto.days, beto.streak_x4, beto.best, beto.mode, Number(beto.played_ms)], [31, 2, 431, 'classic', 86400000]);
  const [{ periods }] = await sql`SELECT periods FROM stats WHERE user_id = (SELECT id FROM users WHERE firebase_uid = 'uidAna')`;
  assert.equal(periods.wm, 120);

  // Beto enlaza su cuenta en la V2 y sigue jugando; Ana juega una más en la V1 antes del corte.
  await sql`UPDATE users SET status = 'active', claimed_at = now() WHERE id = ${beto.id}`;
  await sql`UPDATE wallets SET earned = earned + 777 WHERE user_id = ${beto.id}`;
  const later = structuredClone(rtdb);
  later.wallets.uidAna.c += 500;
  later.wallets.uidBeto.c = 200000000;                   // dato viejo de Firebase: no debe pisar el de la V2
  const second = await load(sql, transform(later, authUsers));
  assert.deepEqual([second.imported, second.skipped], [2, 1]);
  const rows = await sql`SELECT u.firebase_uid, w.earned FROM users u JOIN wallets w ON w.user_id = u.id ORDER BY 1`;
  assert.deepEqual(rows.map((r) => [r.firebase_uid, Number(r.earned)]), [['uidAna', 9500], ['uidBeto', 250000777], ['uidNueva', 0]]);
  assert.equal((await sql`SELECT count(*)::int AS n FROM users`)[0].n, 3, 'repetir la carga no duplica cuentas');

  const commands = await leaderboardCommands(sql);
  assert.ok(commands.some((c) => c[0] === 'ZADD' && c[1] === 'lb:classic:best' && c[2] === '431' && c[3] === beto.id));
  assert.ok(commands.some((c) => c.join(' ') === `ZADD lb:classic:m:202611 431 ${beto.id}`));
});

test('cargar: con datos anómalos no se guarda nada', { skip: !hasDatabase && 'falta TEST_DATABASE_URL' }, async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.drop());
  const broken = structuredClone(rtdb);
  broken.wallets.uidAna.sp = 99999;
  await assert.rejects(load(db.sql, transform(broken, authUsers)), MigrationError);
  assert.equal((await db.sql`SELECT count(*)::int AS n FROM users`)[0].n, 0);
});
