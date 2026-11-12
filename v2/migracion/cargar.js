// Carga en PostgreSQL lo que entrega transformar.js. Todo o nada: una sola transacción que se deshace
// si las sumas de control de PostgreSQL no calzan con las de Firebase.
// Se puede repetir (carga de ensayo, carga final): las cuentas que ya se enlazaron a un SSO en la V2
// no se tocan, para no pisar lo que hayan avanzado.
import { totalsOf } from './transformar.js';

export class MigrationError extends Error {}

/**
 * @param {import('postgres').Sql} sql
 * @param {{ users: object[], anomalies: string[] }} data  resultado de transform()
 */
export async function load(sql, { users, anomalies }) {
  if (anomalies.length) throw new MigrationError('Hay datos anómalos; revísalos antes de cargar:\n' + anomalies.join('\n'));
  return sql.begin(async (tx) => {
    const imported = [];
    let skipped = 0;
    for (const u of users) {
      const [row] = await tx`
        INSERT INTO users (firebase_uid, display_name, name_key, legacy_email, avatar, golden_frame, role, played_ms, status, created_at)
        VALUES (${u.firebaseUid}, ${u.displayName}, ${u.nameKey}, ${u.legacyEmail}, ${u.avatar}, ${u.goldenFrame}, ${u.role},
                ${u.score?.playedMs ?? 0}, 'legacy_unclaimed', COALESCE(${u.createdAt}, now()))
        ON CONFLICT (firebase_uid) DO UPDATE SET
          display_name = EXCLUDED.display_name, name_key = EXCLUDED.name_key, legacy_email = EXCLUDED.legacy_email,
          avatar = EXCLUDED.avatar, golden_frame = EXCLUDED.golden_frame, role = EXCLUDED.role, played_ms = EXCLUDED.played_ms
        WHERE users.status = 'legacy_unclaimed'
        RETURNING id`;
      if (!row) { skipped++; continue; }           // ya reclamada en la V2: no se pisa
      const id = row.id;
      imported.push(u);

      for (const table of ['wallets', 'inventory', 'equipped', 'streaks', 'scores', 'period_scores', 'stats', 'achievements', 'wheel', 'vip_contacts'])
        await tx`DELETE FROM ${tx(table)} WHERE user_id = ${id}`;

      await tx`INSERT INTO wallets (user_id, earned, spent, last_run_legacy) VALUES (${id}, ${u.wallet.earned}, ${u.wallet.spent}, ${u.wallet.lastRun})`;
      if (u.inventory.length) await tx`INSERT INTO inventory ${tx(u.inventory.map((i) => ({ user_id: id, item_id: i.itemId, acquired_at: i.acquiredAt })))}`;
      if (u.equipped.length) await tx`INSERT INTO equipped ${tx(u.equipped.map((e) => ({ user_id: id, slot: e.slot, item_id: e.itemId })))}`;
      if (u.streak) await tx`INSERT INTO streaks ${tx({
        user_id: id, days: u.streak.days, last_claim_at: u.streak.lastClaimAt,
        streak_x2: u.streak.x2, streak_x3: u.streak.x3, streak_x4: u.streak.x4,
        wheel_x2: u.streak.y2, wheel_x3: u.streak.y3, wheel_x4: u.streak.y4,
        boost_started_at: u.streak.boostStartedAt, boost_mult: u.streak.boostMult, boost_ms: u.streak.boostMs })}`;
      // Todo lo de la V1 se jugó sin power-ups de pago: va al marcador clásico.
      if (u.score) await tx`INSERT INTO scores (user_id, mode, best, best_at) VALUES (${id}, 'classic', ${u.score.best}, ${u.score.bestAt})`;
      if (u.periodScores.length) await tx`INSERT INTO period_scores ${tx(u.periodScores.map((p) => ({ ...p, mode: 'classic', user_id: id })))}`;
      if (u.stats) await tx`INSERT INTO stats (user_id, games, bounces, periods) VALUES (${id}, ${u.stats.games}, ${u.stats.bounces}, ${tx.json(u.stats.periods)})`;
      if (u.achievements.length) await tx`INSERT INTO achievements ${tx(u.achievements.map((a) => ({ user_id: id, achievement_id: a })))}`;
      if (u.wheel) await tx`INSERT INTO wheel (user_id, last_spin_at, claimed_spin) VALUES (${id}, ${u.wheel.lastSpinAt}, ${u.wheel.claimedSpin})`;
      if (u.vip) await tx`INSERT INTO vip_contacts (user_id, whatsapp, consent, left_at) VALUES (${id}, ${u.vip.whatsapp}, ${u.vip.consent}, ${u.vip.leftAt})`;
      await tx`
        INSERT INTO legacy_snapshots (firebase_uid, user_id, data) VALUES (${u.firebaseUid}, ${id}, ${tx.json(u.snapshot)})
        ON CONFLICT (firebase_uid) DO UPDATE SET data = EXCLUDED.data, imported_at = now()`;
    }

    const expected = totalsOf(imported);
    const actual = await databaseTotals(tx, imported.map((u) => u.firebaseUid));
    const diffs = Object.keys(expected).filter((k) => expected[k] !== actual[k]).map((k) => `${k}: Firebase ${expected[k]} ≠ PostgreSQL ${actual[k]}`);
    if (diffs.length) throw new MigrationError('Las sumas de control no calzan (no se guardó nada):\n' + diffs.join('\n'));
    return { imported: imported.length, skipped, totals: actual };
  });
}

/** Las mismas sumas de totalsOf(), pero leídas de PostgreSQL. */
export async function databaseTotals(sql, firebaseUids) {
  const [t] = await sql`
    WITH u AS (SELECT id FROM users WHERE firebase_uid = ANY(${firebaseUids}))
    SELECT
      (SELECT count(*) FROM u) AS users,
      (SELECT COALESCE(sum(earned), 0) FROM wallets WHERE user_id IN (SELECT id FROM u)) AS earned,
      (SELECT COALESCE(sum(spent), 0) FROM wallets WHERE user_id IN (SELECT id FROM u)) AS spent,
      (SELECT count(*) FROM inventory WHERE user_id IN (SELECT id FROM u)) AS items,
      (SELECT COALESCE(sum(days), 0) FROM streaks WHERE user_id IN (SELECT id FROM u)) AS "streakDays",
      (SELECT COALESCE(sum(streak_x2 + streak_x3 + streak_x4 + wheel_x2 + wheel_x3 + wheel_x4), 0) FROM streaks WHERE user_id IN (SELECT id FROM u)) AS "savedMultipliers",
      (SELECT COALESCE(sum(best), 0) FROM scores WHERE user_id IN (SELECT id FROM u)) AS "bestScores",
      (SELECT COALESCE(sum(played_ms), 0) FROM users WHERE id IN (SELECT id FROM u)) AS "playedMs",
      (SELECT COALESCE(sum(games), 0) FROM stats WHERE user_id IN (SELECT id FROM u)) AS games,
      (SELECT count(*) FROM achievements WHERE user_id IN (SELECT id FROM u)) AS achievements`;
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Number(v)]));
}
