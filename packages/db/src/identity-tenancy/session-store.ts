import type { Pool, PoolClient } from "pg";

export interface SessionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly membershipId: string;
  readonly userId: string;
  readonly tokenDigest: string;
  readonly expiresAt: Date;
}

export interface ActiveSession extends SessionRecord {
  readonly role: "OWNER" | "ADMIN" | "STAFF";
}

async function insert(client: PoolClient, session: SessionRecord): Promise<void> {
  await client.query(
    `INSERT INTO sessions
      (id, organization_id, membership_id, user_id, token_digest, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [session.id, session.organizationId, session.membershipId, session.userId, session.tokenDigest, session.expiresAt]
  );
}

export class SessionStore {
  constructor(private readonly pool: Pool) {}

  async create(session: SessionRecord): Promise<void> {
    const client = await this.pool.connect();
    try { await insert(client, session); } finally { client.release(); }
  }

  async findActiveByDigest(tokenDigest: string): Promise<ActiveSession | null> {
    const result = await this.pool.query<{
      id: string; organization_id: string; membership_id: string; user_id: string;
      token_digest: string; expires_at: Date; role: ActiveSession["role"];
    }>(
      `SELECT s.id, s.organization_id, s.membership_id, s.user_id, s.token_digest, s.expires_at, m.role
         FROM sessions s
         JOIN memberships m ON (m.id, m.organization_id, m.user_id) = (s.membership_id, s.organization_id, s.user_id)
         JOIN users u ON u.id = s.user_id
         JOIN organizations o ON o.id = s.organization_id
        WHERE s.token_digest = $1 AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
          AND m.status = 'ACTIVE' AND u.status = 'ACTIVE' AND o.status = 'ACTIVE'`,
      [tokenDigest]
    );
    const row = result.rows[0];
    return row ? {
      id: row.id, organizationId: row.organization_id, membershipId: row.membership_id,
      userId: row.user_id, tokenDigest: row.token_digest, expiresAt: row.expires_at, role: row.role
    } : null;
  }

  async rotate(oldDigest: string, next: SessionRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const revoked = await client.query(
        `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP
          WHERE token_digest = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
          RETURNING id`,
        [oldDigest]
      );
      if (revoked.rowCount !== 1) throw new Error("Active session was not found for rotation.");
      await insert(client, next);
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve original failure. */ }
      throw error;
    } finally { client.release(); }
  }

  async revoke(sessionId: string): Promise<void> {
    await this.pool.query(
      "UPDATE sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE id = $1",
      [sessionId]
    );
  }

  async revokeForMembership(membershipId: string): Promise<number> {
    const result = await this.pool.query(
      "UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE membership_id = $1 AND revoked_at IS NULL",
      [membershipId]
    );
    return result.rowCount ?? 0;
  }
}
