// Partidas y uso de power-ups. (El cierre y el cobro de la partida llegan en el paso 3.)
import { HttpError } from '../services/errors.js';
import { POWERUP_RULES, MatchMode } from '../../../shared/catalog.js';

const MAX_MATCH_MINUTES = 60;

export class MatchRepository {
  /** @param {import('postgres').Sql} sql */
  constructor(sql) { this.sql = sql; }

  /** Empieza una partida (y da por terminada cualquiera que hubiera quedado abierta). */
  start(userId, mode) {
    return this.sql.begin(async (tx) => {
      await tx`UPDATE matches SET ended_at = now() WHERE user_id = ${userId} AND ended_at IS NULL`;
      const [match] = await tx`INSERT INTO matches (user_id, mode) VALUES (${userId}, ${mode}) RETURNING id`;
      return { matchId: match.id, mode };
    });
  }

  /**
   * Gasta un power-up AHORA, en esta partida. Todo o nada: se descuenta del inventario, se anota en la partida
   * y en el libro de movimientos. Dos toques a la vez no gastan dos ni pasan del límite (la partida se bloquea).
   */
  usePowerUp(userId, matchId, powerupId) {
    return this.sql.begin(async (tx) => {
      const [match] = await tx`
        SELECT mode, ended_at IS NULL AND started_at > now() - make_interval(mins => ${MAX_MATCH_MINUTES}) AS open
        FROM matches WHERE id = ${matchId} AND user_id = ${userId} FOR UPDATE`;
      if (!match) throw new HttpError(404, 'partida_no_encontrada');
      if (!match.open) throw new HttpError(409, 'partida_cerrada');
      if (match.mode !== MatchMode.ARCADE) throw new HttpError(409, 'modo_clasico_sin_powerups');

      const used = await tx`SELECT powerup_id, used_at > now() - make_interval(secs => ${POWERUP_RULES.durationMs / 1000}) AS active FROM match_powerups WHERE match_id = ${matchId}`;
      if (used.length >= POWERUP_RULES.maxPerMatch) throw new HttpError(409, 'limite_por_partida');
      if (used.some((u) => u.powerup_id === powerupId && u.active)) throw new HttpError(409, 'powerup_ya_activo');

      const [left] = await tx`
        UPDATE powerup_inventory SET quantity = quantity - 1
        WHERE user_id = ${userId} AND powerup_id = ${powerupId} AND quantity >= 1 RETURNING quantity`;
      if (!left) throw new HttpError(409, 'sin_powerups');
      await tx`INSERT INTO match_powerups (match_id, slot, powerup_id) VALUES (${matchId}, ${used.length + 1}, ${powerupId})`;
      await tx`INSERT INTO powerup_ledger (user_id, powerup_id, delta, reason, ref) VALUES (${userId}, ${powerupId}, -1, 'match', ${matchId})`;
      return { powerupId, remaining: left.quantity, usedThisMatch: used.length + 1, durationMs: POWERUP_RULES.durationMs };
    });
  }
}
