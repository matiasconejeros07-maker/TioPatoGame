export class SessionRepository {
  /** @param {import('postgres').Sql} sql */
  constructor(sql) { this.sql = sql; }

  /** @returns {Promise<{ id: string, userId: string } | null>} la sesión si existe, no venció y no fue revocada */
  async findActive(sessionId) {
    const [row] = await this.sql`
      SELECT id, user_id FROM sessions WHERE id = ${sessionId} AND revoked_at IS NULL AND expires_at > now()`;
    return row ? { id: row.id, userId: row.user_id } : null;
  }
}
