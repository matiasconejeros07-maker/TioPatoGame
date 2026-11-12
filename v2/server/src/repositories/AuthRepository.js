// Inicio de sesión y Device Binding en una sola transacción.
// Reglas: 1 dispositivo = 1 cuenta · 1 cuenta = 1 dispositivo activo · cambiar de teléfono, una vez cada 30 días.
import { HttpError } from '../services/errors.js';
import { DEVICE_CHANGE_DAYS, SESSION_DAYS } from '../../../shared/devices.js';

export class AuthRepository {
  /** @param {import('postgres').Sql} sql */
  constructor(sql) { this.sql = sql; }

  /** Lo que se sabe de un dispositivo (para verificar una aserción de App Attest). */
  async findDevice(hardwareId) {
    const [row] = await this.sql`SELECT public_key, sign_count FROM devices WHERE hardware_id = ${hardwareId}`;
    return row ? { publicKey: row.public_key ? new Uint8Array(row.public_key) : null, signCount: Number(row.sign_count) } : null;
  }

  /**
   * @param {{ provider: string, subject: string, refreshTokenEnc: string|null, platform: 'ios'|'android', hardwareId: string,
   *           publicKey: Uint8Array|null, signCount: number, confirmDeviceChange: boolean }} input  identidad y dispositivo YA verificados
   * @returns {Promise<{ sessionId: string, userId: string, displayName: string, isNew: boolean, hasLegacyAccount: boolean }>}
   */
  async signIn(input) {
    try { return await this.sql.begin((tx) => this.#signIn(tx, input)); }
    catch (error) {
      if (error.code === '23505') throw new HttpError(409, 'reintentar');       // dos inicios de sesión a la vez
      throw error;
    }
  }

  async #signIn(tx, { provider, subject, refreshTokenEnc, platform, hardwareId, publicKey, signCount, confirmDeviceChange }) {
    const [identity] = await tx`SELECT user_id FROM identities WHERE provider = ${provider} AND subject = ${subject} FOR UPDATE`;
    const [device] = await tx`SELECT user_id FROM devices WHERE hardware_id = ${hardwareId} FOR UPDATE`;
    const newDevice = { hardware_id: hardwareId, platform, public_key: publicKey, sign_count: signCount };
    let userId = identity?.user_id, isNew = false;

    if (!identity) {
      // Identidad nueva. Si este teléfono ya tiene cuenta, no se crea otra (nada de multicuentas).
      if (device) throw new HttpError(409, 'dispositivo_con_otra_cuenta');
      const digits = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000_000).padStart(9, '0');
      const [user] = await tx`INSERT INTO users (display_name, name_key) VALUES (${'Pato' + digits}, ${'pato' + digits}) RETURNING id`;
      userId = user.id; isNew = true;
      await tx`INSERT INTO wallets (user_id) VALUES (${userId})`;
      await tx`INSERT INTO identities (provider, subject, user_id, refresh_token_enc) VALUES (${provider}, ${subject}, ${userId}, ${refreshTokenEnc})`;
      await tx`INSERT INTO devices ${tx({ ...newDevice, user_id: userId })}`;
    } else if (device) {
      if (device.user_id !== userId) throw new HttpError(409, 'dispositivo_con_otra_cuenta');
      await tx`UPDATE devices SET sign_count = ${signCount} WHERE hardware_id = ${hardwareId}`;
    } else {
      // Cuenta existente en un teléfono que no conocemos: es un cambio de teléfono.
      const [user] = await tx`
        SELECT device_changed_at + make_interval(days => ${DEVICE_CHANGE_DAYS}) AS next_change_at,
               (SELECT count(*) FROM devices WHERE user_id = users.id) > 0 AS has_device
        FROM users WHERE id = ${userId} FOR UPDATE`;
      if (user.has_device) {
        if (user.next_change_at && user.next_change_at > new Date())
          throw new HttpError(429, 'cambio_de_dispositivo_en_espera', undefined, { nextChangeAt: user.next_change_at.toISOString() });
        // La app tiene que haberle avisado al jugador: la cuenta saldrá del otro teléfono y no podrá volver a moverla en 30 días.
        if (!confirmDeviceChange) throw new HttpError(409, 'confirmar_cambio_de_dispositivo');
        await tx`DELETE FROM devices WHERE user_id = ${userId}`;
        await tx`UPDATE users SET device_changed_at = now() WHERE id = ${userId}`;
      }
      await tx`INSERT INTO devices ${tx({ ...newDevice, user_id: userId })}`;
    }

    if (identity && refreshTokenEnc) await tx`UPDATE identities SET refresh_token_enc = ${refreshTokenEnc} WHERE provider = ${provider} AND subject = ${subject}`;
    // Una sola sesión viva por cuenta: la anterior (del teléfono viejo, o una copiada) deja de servir.
    await tx`UPDATE sessions SET revoked_at = now() WHERE user_id = ${userId} AND revoked_at IS NULL`;
    const [session] = await tx`
      INSERT INTO sessions (user_id, hardware_id, expires_at) VALUES (${userId}, ${hardwareId}, now() + make_interval(days => ${SESSION_DAYS})) RETURNING id`;
    const [profile] = await tx`
      SELECT display_name, firebase_uid IS NOT NULL AS has_legacy,
             name_changed_at + make_interval(days => 30) AS next_name_change_at FROM users WHERE id = ${userId}`;
    return {
      sessionId: session.id, userId, displayName: profile.display_name, isNew, hasLegacyAccount: profile.has_legacy,
      nextNameChangeAt: profile.next_name_change_at?.toISOString() ?? null,
    };
  }
}
