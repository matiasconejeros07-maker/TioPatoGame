import { HttpError } from '../services/errors.js';
import { NAME_CHANGE_DAYS } from '../../../shared/names.js';

/** El personaje secreto (el de los 100 millones). Mismo id que en la V1. */
const SECRET_CHARACTER = 'ch_millonario';

const sha256Hex = async (text) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');

export class AccountRepository {
  /** @param {import('postgres').Sql} sql */
  constructor(sql) { this.sql = sql; }

  /**
   * Enlaza la cuenta de la V1 (ya importada desde Firebase) con la cuenta SSO que el jugador acaba de crear.
   * La cuenta antigua pasa a ser LA cuenta: hereda la identidad (Apple / Play Games), el dispositivo y las
   * sesiones de la nueva, y la nueva (vacía) desaparece. Todo en una transacción.
   * @returns {Promise<string>} el id de la cuenta que queda
   */
  linkLegacy(currentUserId, firebaseUid) {
    return this.sql.begin(async (tx) => {
      // se bloquean las dos filas en orden fijo (por id) para que dos intentos simultáneos no se crucen
      const rows = await tx`
        SELECT id, firebase_uid, status FROM users WHERE id = ${currentUserId} OR firebase_uid = ${firebaseUid} ORDER BY id FOR UPDATE`;
      const current = rows.find((r) => r.id === currentUserId);
      const legacy = rows.find((r) => r.firebase_uid === firebaseUid);
      if (!current) throw new HttpError(401, 'sesion_invalida');
      if (!legacy) throw new HttpError(404, 'cuenta_antigua_no_encontrada');
      if (legacy.id === current.id) return current.id;                                   // ya estaba enlazada (reintento)
      if (legacy.status !== 'legacy_unclaimed') throw new HttpError(409, 'cuenta_antigua_ya_enlazada');
      if (current.firebase_uid) throw new HttpError(409, 'esta_cuenta_ya_tiene_una_antigua');

      // Si ya compró power-ups con la cuenta nueva, se los lleva.
      await tx`
        INSERT INTO powerup_inventory (user_id, powerup_id, quantity)
        SELECT ${legacy.id}, powerup_id, quantity FROM powerup_inventory WHERE user_id = ${current.id}
        ON CONFLICT (user_id, powerup_id) DO UPDATE SET quantity = powerup_inventory.quantity + EXCLUDED.quantity`;
      await tx`UPDATE entitlements SET user_id = ${legacy.id} WHERE user_id = ${current.id}`;
      await tx`UPDATE powerup_ledger SET user_id = ${legacy.id} WHERE user_id = ${current.id}`;
      await tx`UPDATE purchases SET user_id = ${legacy.id} WHERE user_id = ${current.id}`;
      await tx`UPDATE identities SET user_id = ${legacy.id} WHERE user_id = ${current.id}`;
      await tx`UPDATE devices SET user_id = ${legacy.id} WHERE user_id = ${current.id}`;
      await tx`UPDATE sessions SET user_id = ${legacy.id} WHERE user_id = ${current.id}`;
      await tx`DELETE FROM users WHERE id = ${current.id}`;
      await tx`UPDATE users SET status = 'active', claimed_at = now(), legacy_email = NULL WHERE id = ${legacy.id}`;
      return legacy.id;
    });
  }

  /**
   * Cambia el nombre del jugador: único (sin distinguir mayúsculas ni tildes) y como mucho una vez cada 30 días.
   * La condición del plazo va en el mismo UPDATE, así dos peticiones a la vez no logran dos cambios.
   * @param {{ displayName: string, key: string }} name  ya validado con checkName()
   * @returns {Promise<{ displayName: string, nextChangeAt: string }>}
   */
  async rename(userId, name) {
    let row;
    try {
      [row] = await this.sql`
        UPDATE users SET display_name = ${name.displayName}, name_key = ${name.key}, name_changed_at = now()
        WHERE id = ${userId} AND (name_changed_at IS NULL OR name_changed_at <= now() - make_interval(days => ${NAME_CHANGE_DAYS}))
        RETURNING display_name, name_changed_at + make_interval(days => ${NAME_CHANGE_DAYS}) AS next_change_at`;
    } catch (error) {
      if (error.code === '23505') throw new HttpError(409, 'nombre_ocupado');      // otro jugador ya tiene ese nombre
      throw error;
    }
    if (row) return { displayName: row.display_name, nextChangeAt: row.next_change_at.toISOString() };
    const [user] = await this.sql`SELECT name_changed_at + make_interval(days => ${NAME_CHANGE_DAYS}) AS next_change_at FROM users WHERE id = ${userId}`;
    if (!user) throw new HttpError(401, 'sesion_invalida');
    throw new HttpError(429, 'cambio_de_nombre_en_espera', undefined, { nextChangeAt: user.next_change_at.toISOString() });
  }

  /**
   * Cuadro VIP: quien desbloqueó el personaje secreto deja su WhatsApp para que lo contacten. Queda en `vip_contacts`.
   * Solo vale si de verdad tiene el personaje. Volver a enviarlo reemplaza el número.
   */
  async saveVipContact(userId, { whatsapp, consent }) {
    const [row] = await this.sql`
      INSERT INTO vip_contacts (user_id, whatsapp, consent, left_at)
      SELECT ${userId}, ${whatsapp}, ${consent}, now()
      WHERE EXISTS (SELECT 1 FROM inventory WHERE user_id = ${userId} AND item_id = ${SECRET_CHARACTER})
      ON CONFLICT (user_id) DO UPDATE SET whatsapp = EXCLUDED.whatsapp, consent = EXCLUDED.consent, left_at = now()
      RETURNING user_id`;
    if (!row) throw new HttpError(403, 'sin_personaje_secreto');
  }

  deleteVipContact(userId) { return this.sql`DELETE FROM vip_contacts WHERE user_id = ${userId}`; }

  /** Identidades SSO de la cuenta (para revocar el acceso de Apple al eliminarla). */
  identities(userId) { return this.sql`SELECT provider, refresh_token_enc FROM identities WHERE user_id = ${userId}`; }

  /**
   * «Eliminar cuenta» (requisito de Apple y Google): borra la cuenta y todo lo suyo. Las compras con dinero
   * real quedan sin dueño (obligación contable) y solo se guarda un rastro sin datos personales.
   * El dispositivo queda libre: Device Binding no impide volver a empezar tras eliminar la cuenta.
   */
  async delete(userId) {
    const userHash = await sha256Hex(userId);
    await this.sql.begin(async (tx) => {
      const [gone] = await tx`DELETE FROM users WHERE id = ${userId} RETURNING id`;     // ON DELETE CASCADE limpia el resto
      if (gone) await tx`INSERT INTO account_deletions (user_hash) VALUES (${userHash})`;
    });
  }
}
