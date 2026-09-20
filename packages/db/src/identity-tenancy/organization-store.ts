import { DomainError } from "@slotly/domain";
import type { MembershipRole } from "@slotly/domain";
import type { Pool } from "pg";

export interface TenantActor {
  readonly organizationId: string;
  readonly userId: string;
  readonly membershipId: string;
  readonly role: MembershipRole;
}

export class OrganizationStore {
  constructor(private readonly pool: Pool) {}

  async getCurrent(tenant: TenantActor) {
    const result = await this.pool.query<{
      id: string; slug: string; display_name: string; default_timezone: string;
      status: string; created_at: Date; updated_at: Date;
    }>(`SELECT id, slug, display_name, default_timezone, status, created_at, updated_at
          FROM organizations WHERE id = $1 AND status = 'ACTIVE'`, [tenant.organizationId]);
    const row = result.rows[0];
    if (!row) throw new DomainError("RESOURCE_NOT_FOUND", "Organizace nebyla nalezena.");
    return { id: row.id, slug: row.slug, displayName: row.display_name, defaultTimezone: row.default_timezone,
      status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  async updateCurrent(tenant: TenantActor, patch: { displayName?: string; defaultTimezone?: string }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query<{ id: string; slug: string; display_name: string; default_timezone: string }>(
        `UPDATE organizations SET
           display_name = COALESCE($1::varchar, display_name),
           default_timezone = COALESCE($2::varchar, default_timezone), updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND status = 'ACTIVE'
         RETURNING id, slug, display_name, default_timezone`,
        [patch.displayName ?? null, patch.defaultTimezone ?? null, tenant.organizationId]
      );
      const row = updated.rows[0];
      if (!row) throw new DomainError("RESOURCE_NOT_FOUND", "Organizace nebyla nalezena.");
      await client.query(
        `INSERT INTO audit_events (id, organization_id, actor_user_id, action, target_type, target_id, metadata)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'organization.updated', 'organization', ($1::uuid)::text, $3::jsonb)`,
        [tenant.organizationId, tenant.userId, JSON.stringify({ fields: Object.keys(patch).sort().join(",") })]
      );
      await client.query("COMMIT");
      return { id: row.id, slug: row.slug, displayName: row.display_name, defaultTimezone: row.default_timezone };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* keep original */ }
      throw error;
    } finally { client.release(); }
  }

  async listMembers(tenant: TenantActor) {
    const result = await this.pool.query<{
      id: string; user_id: string; email: string; display_name: string; role: MembershipRole; status: "ACTIVE" | "SUSPENDED"; created_at: Date;
    }>(`SELECT m.id, m.user_id, u.email, u.display_name, m.role, m.status, m.created_at
          FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.organization_id = $1 ORDER BY m.created_at, m.id`, [tenant.organizationId]);
    return result.rows.map((row) => ({ id: row.id, userId: row.user_id, email: row.email,
      displayName: row.display_name, role: row.role, status: row.status, createdAt: row.created_at }));
  }

  async listAudit(tenant: TenantActor, limit: number, before?: Date) {
    const result = await this.pool.query<{
      id: string; actor_user_id: string | null; action: string; target_type: string; target_id: string; occurred_at: Date; metadata: Record<string, unknown>;
    }>(`SELECT id, actor_user_id, action, target_type, target_id, occurred_at, metadata
          FROM audit_events
         WHERE organization_id = $1 AND ($2::timestamptz IS NULL OR occurred_at < $2)
         ORDER BY occurred_at DESC, id DESC LIMIT $3`, [tenant.organizationId, before ?? null, limit]);
    return result.rows.map((row) => ({ id: row.id, actorUserId: row.actor_user_id, action: row.action,
      targetType: row.target_type, targetId: row.target_id, occurredAt: row.occurred_at, metadata: row.metadata }));
  }
}
