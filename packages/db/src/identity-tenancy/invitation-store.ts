import { DomainError } from "@slotly/domain";
import type { MembershipRole } from "@slotly/domain";
import type { Pool } from "pg";

export interface InvitationRecord {
  readonly id: string; readonly organizationId: string; readonly email: string;
  readonly role: MembershipRole; readonly tokenDigest: string; readonly expiresAt: Date;
}

export interface AcceptInvitationInput {
  readonly tokenDigest: string; readonly email: string; readonly userId: string;
  readonly membershipId: string; readonly auditEventId: string;
  readonly displayName?: string; readonly passwordHash?: string;
}

export class InvitationStore {
  constructor(private readonly pool: Pool) {}

  async create(record: InvitationRecord, actorUserId?: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO invitations (id, organization_id, email, role, token_digest, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [record.id, record.organizationId, record.email, record.role, record.tokenDigest, record.expiresAt]
      );
      if (actorUserId) await client.query(
        `INSERT INTO audit_events (id, organization_id, actor_user_id, action, target_type, target_id, metadata)
         VALUES (gen_random_uuid(), $1, $2, 'invitation.created', 'invitation', $3, $4::jsonb)`,
        [record.organizationId, actorUserId, record.id, JSON.stringify({ role: record.role })]
      );
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve original failure. */ }
      throw error;
    } finally { client.release(); }
  }

  async accept(input: AcceptInvitationInput): Promise<{ userId: string; membershipId: string; replayed: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const invitationResult = await client.query<{
        id: string; organization_id: string; email: string; role: MembershipRole;
        status: "PENDING" | "ACCEPTED" | "REVOKED"; expires_at: Date; accepted_by_user_id: string | null;
      }>("SELECT * FROM invitations WHERE token_digest = $1 FOR UPDATE", [input.tokenDigest]);
      const invitation = invitationResult.rows[0];
      if (!invitation || invitation.status === "REVOKED") throw new DomainError("INVITATION_INVALID", "Pozvánka není platná.");
      if (invitation.email !== input.email) throw new DomainError("INVITATION_EMAIL_MISMATCH", "E-mail neodpovídá pozvánce.");

      if (invitation.status === "ACCEPTED" && invitation.accepted_by_user_id) {
        const existing = await client.query<{ id: string }>(
          "SELECT id FROM memberships WHERE organization_id = $1 AND user_id = $2",
          [invitation.organization_id, invitation.accepted_by_user_id]
        );
        await client.query("COMMIT");
        return { userId: invitation.accepted_by_user_id, membershipId: existing.rows[0]?.id ?? input.membershipId, replayed: true };
      }
      if (invitation.expires_at.getTime() <= Date.now()) throw new DomainError("INVITATION_EXPIRED", "Platnost pozvánky vypršela.");

      const foundUser = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [input.email]);
      let userId = foundUser.rows[0]?.id;
      if (!userId) {
        if (!input.displayName || !input.passwordHash) throw new DomainError("VALIDATION_FAILED", "Pro nového uživatele je vyžadováno jméno a heslo.");
        userId = input.userId;
        await client.query(
          "INSERT INTO users (id, email, display_name, password_hash, updated_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)",
          [userId, input.email, input.displayName, input.passwordHash]
        );
      }

      const membership = await client.query<{ id: string }>(
        `INSERT INTO memberships (id, organization_id, user_id, role, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (organization_id, user_id) DO UPDATE SET updated_at = memberships.updated_at
         RETURNING id`,
        [input.membershipId, invitation.organization_id, userId, invitation.role]
      );
      await client.query(
        "UPDATE invitations SET status = 'ACCEPTED', accepted_at = CURRENT_TIMESTAMP, accepted_by_user_id = $1 WHERE id = $2",
        [userId, invitation.id]
      );
      await client.query(
        "INSERT INTO audit_events (id, organization_id, actor_user_id, action, target_type, target_id) VALUES ($1, $2, $3, 'invitation.accepted', 'membership', $4)",
        [input.auditEventId, invitation.organization_id, userId, membership.rows[0]?.id ?? input.membershipId]
      );
      await client.query("COMMIT");
      return { userId, membershipId: membership.rows[0]?.id ?? input.membershipId, replayed: false };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve original failure. */ }
      throw error;
    } finally { client.release(); }
  }
}
