import type { Pool, PoolClient } from "pg";

export interface OwnerRegistrationRecord {
  readonly userId: string;
  readonly organizationId: string;
  readonly membershipId: string;
  readonly auditEventId: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly organizationName: string;
  readonly organizationSlug: string;
  readonly timezone: string;
}

export class RegistrationStore {
  constructor(private readonly pool: Pool) {}

  async registerOwner(record: OwnerRegistrationRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.registerOwnerWithClient(record, client);
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve original failure. */ }
      throw error;
    } finally { client.release(); }
  }

  async registerOwnerWithClient(record: OwnerRegistrationRecord, client: PoolClient): Promise<void> {
      await client.query(
        "INSERT INTO users (id, email, display_name, password_hash, updated_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)",
        [record.userId, record.email, record.displayName, record.passwordHash]
      );
      await client.query(
        "INSERT INTO organizations (id, slug, display_name, default_timezone, updated_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)",
        [record.organizationId, record.organizationSlug, record.organizationName, record.timezone]
      );
      await client.query(
        "INSERT INTO memberships (id, organization_id, user_id, role, updated_at) VALUES ($1, $2, $3, 'OWNER', CURRENT_TIMESTAMP)",
        [record.membershipId, record.organizationId, record.userId]
      );
      await client.query(
        "INSERT INTO audit_events (id, organization_id, actor_user_id, action, target_type, target_id) VALUES ($1, $2, $3, 'organization.registered', 'organization', $4)",
        [record.auditEventId, record.organizationId, record.userId, record.organizationId]
      );
  }
}
