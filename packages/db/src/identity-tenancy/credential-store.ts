import type { Pool } from "pg";

export interface LoginCredentialRecord {
  readonly userId: string; readonly passwordHash: string;
  readonly membershipId: string; readonly organizationId: string;
}

export class CredentialStore {
  constructor(private readonly pool: Pool) {}

  async findForLogin(email: string): Promise<LoginCredentialRecord | null> {
    const result = await this.pool.query<{
      user_id: string; password_hash: string; membership_id: string; organization_id: string;
    }>(
      `SELECT u.id AS user_id, u.password_hash, m.id AS membership_id, m.organization_id
         FROM users u JOIN memberships m ON m.user_id = u.id JOIN organizations o ON o.id = m.organization_id
        WHERE u.email = $1 AND u.status = 'ACTIVE' AND m.status = 'ACTIVE' AND o.status = 'ACTIVE'
        ORDER BY m.created_at ASC LIMIT 1`,
      [email]
    );
    const row = result.rows[0];
    return row ? { userId: row.user_id, passwordHash: row.password_hash, membershipId: row.membership_id, organizationId: row.organization_id } : null;
  }
}
