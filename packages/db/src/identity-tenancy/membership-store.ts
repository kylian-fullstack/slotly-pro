import { DomainError } from "@slotly/domain";
import type { MembershipRole } from "@slotly/domain";
import type { Pool, PoolClient } from "pg";

interface ChangeMembershipRoleInput {
  readonly organizationId: string;
  readonly targetMembershipId: string;
  readonly nextRole: MembershipRole;
}

interface MembershipRow {
  readonly id?: string;
  readonly organization_id?: string;
  readonly user_id?: string;
  readonly role: MembershipRole;
  readonly status: "ACTIVE" | "SUSPENDED";
}

async function rollback(client: PoolClient): Promise<void> {
  try { await client.query("ROLLBACK"); } catch { /* Preserve the original failure. */ }
}

export class MembershipStore {
  constructor(private readonly pool: Pool) {}

  async find(organizationId: string, membershipId: string) {
    const result = await this.pool.query<MembershipRow & { id: string; organization_id: string; user_id: string; created_at: Date }>(
      "SELECT id, organization_id, user_id, role, status, created_at FROM memberships WHERE id = $1 AND organization_id = $2",
      [membershipId, organizationId]
    );
    const row = result.rows[0];
    return row ? { id: row.id, organizationId: row.organization_id, userId: row.user_id, role: row.role, status: row.status, createdAt: row.created_at } : null;
  }

  async changeRole(input: ChangeMembershipRoleInput & { readonly actorUserId?: string }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM organizations WHERE id = $1 FOR UPDATE", [input.organizationId]);
      const target = await client.query<MembershipRow>(
        "SELECT role, status FROM memberships WHERE id = $1 AND organization_id = $2",
        [input.targetMembershipId, input.organizationId]
      );
      const membership = target.rows[0];
      if (!membership) throw new DomainError("RESOURCE_NOT_FOUND", "Membership was not found.");

      if (membership.role === "OWNER" && membership.status === "ACTIVE" && input.nextRole !== "OWNER") {
        const owners = await client.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM memberships WHERE organization_id = $1 AND role = 'OWNER' AND status = 'ACTIVE'",
          [input.organizationId]
        );
        if (Number(owners.rows[0]?.count ?? 0) <= 1) {
          throw new DomainError("LAST_OWNER_REQUIRED", "Organization must retain an active owner.");
        }
      }

      await client.query(
        "UPDATE memberships SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND organization_id = $3",
        [input.nextRole, input.targetMembershipId, input.organizationId]
      );
      await client.query(
        "UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE membership_id = $1 AND revoked_at IS NULL",
        [input.targetMembershipId]
      );
      if (input.actorUserId) await client.query(
        `INSERT INTO audit_events (id, organization_id, actor_user_id, action, target_type, target_id, metadata)
         VALUES (gen_random_uuid(), $1, $2, 'membership.role_changed', 'membership', $3, $4::jsonb)`,
        [input.organizationId, input.actorUserId, input.targetMembershipId, JSON.stringify({ role: input.nextRole })]
      );
      await client.query("COMMIT");
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async changeStatus(input: { readonly organizationId: string; readonly targetMembershipId: string; readonly nextStatus: "ACTIVE" | "SUSPENDED"; readonly actorUserId?: string }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM organizations WHERE id = $1 FOR UPDATE", [input.organizationId]);
      const target = await client.query<MembershipRow>(
        "SELECT role, status FROM memberships WHERE id = $1 AND organization_id = $2",
        [input.targetMembershipId, input.organizationId]
      );
      const membership = target.rows[0];
      if (!membership) throw new DomainError("RESOURCE_NOT_FOUND", "Membership was not found.");
      if (membership.role === "OWNER" && membership.status === "ACTIVE" && input.nextStatus !== "ACTIVE") {
        const owners = await client.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM memberships WHERE organization_id = $1 AND role = 'OWNER' AND status = 'ACTIVE'",
          [input.organizationId]
        );
        if (Number(owners.rows[0]?.count ?? 0) <= 1) throw new DomainError("LAST_OWNER_REQUIRED", "Organization must retain an active owner.");
      }
      await client.query(
        "UPDATE memberships SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND organization_id = $3",
        [input.nextStatus, input.targetMembershipId, input.organizationId]
      );
      await client.query(
        "UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE membership_id = $1 AND revoked_at IS NULL",
        [input.targetMembershipId]
      );
      if (input.actorUserId) await client.query(
        `INSERT INTO audit_events (id, organization_id, actor_user_id, action, target_type, target_id, metadata)
         VALUES (gen_random_uuid(), $1, $2, 'membership.status_changed', 'membership', $3, $4::jsonb)`,
        [input.organizationId, input.actorUserId, input.targetMembershipId, JSON.stringify({ status: input.nextStatus })]
      );
      await client.query("COMMIT");
    } catch (error) {
      await rollback(client);
      throw error;
    } finally { client.release(); }
  }

  async remove(input: { readonly organizationId: string; readonly targetMembershipId: string; readonly actorUserId: string }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM organizations WHERE id = $1 FOR UPDATE", [input.organizationId]);
      const target = await client.query<MembershipRow>(
        "SELECT role, status FROM memberships WHERE id = $1 AND organization_id = $2 FOR UPDATE",
        [input.targetMembershipId, input.organizationId]
      );
      const membership = target.rows[0];
      if (!membership) throw new DomainError("RESOURCE_NOT_FOUND", "Membership was not found.");
      if (membership.role === "OWNER" && membership.status === "ACTIVE") {
        const owners = await client.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM memberships WHERE organization_id = $1 AND role = 'OWNER' AND status = 'ACTIVE'",
          [input.organizationId]
        );
        if (Number(owners.rows[0]?.count ?? 0) <= 1) throw new DomainError("LAST_OWNER_REQUIRED", "Organization must retain an active owner.");
      }
      await client.query("DELETE FROM sessions WHERE membership_id = $1", [input.targetMembershipId]);
      await client.query("DELETE FROM memberships WHERE id = $1 AND organization_id = $2", [input.targetMembershipId, input.organizationId]);
      await client.query(
        `INSERT INTO audit_events (id, organization_id, actor_user_id, action, target_type, target_id)
         VALUES (gen_random_uuid(), $1, $2, 'membership.removed', 'membership', $3)`,
        [input.organizationId, input.actorUserId, input.targetMembershipId]
      );
      await client.query("COMMIT");
    } catch (error) {
      await rollback(client);
      throw error;
    } finally { client.release(); }
  }
}
