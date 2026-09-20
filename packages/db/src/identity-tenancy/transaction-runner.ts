import type {
  AuditEvent, Invitation, Membership, Session, TenantContext, TransactionContext, TransactionRunner, User
} from "@slotly/domain";
import type { Pool, PoolClient } from "pg";

const iso = (value: Date) => value.toISOString() as never;

function context(client: PoolClient): TransactionContext {
  return {
    users: {
      async findByEmail(email) {
        const result = await client.query("SELECT * FROM users WHERE email = $1", [email]);
        const row = result.rows[0];
        return row ? { id: row.id, email: row.email, displayName: row.display_name, passwordHash: row.password_hash,
          status: row.status, createdAt: iso(row.created_at) } as User : null;
      },
      async findById(userId) {
        const result = await client.query("SELECT * FROM users WHERE id = $1", [userId]);
        const row = result.rows[0];
        return row ? { id: row.id, email: row.email, displayName: row.display_name, passwordHash: row.password_hash,
          status: row.status, createdAt: iso(row.created_at) } as User : null;
      },
      async insert(user) {
        await client.query(`INSERT INTO users (id, email, display_name, password_hash, status, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$6)`, [user.id, user.email, user.displayName, user.passwordHash, user.status, user.createdAt]);
      }
    },
    memberships: {
      async findForUser(tenant: TenantContext, userId) {
        const result = await client.query("SELECT * FROM memberships WHERE organization_id = $1 AND user_id = $2", [tenant.organizationId, userId]);
        return mapMembership(result.rows[0]);
      },
      async listForOrganization(tenant: TenantContext) {
        const result = await client.query("SELECT * FROM memberships WHERE organization_id = $1 ORDER BY created_at, id", [tenant.organizationId]);
        return result.rows.map(mapMembership).filter((value): value is Membership => value !== null);
      },
      async insert(membership) {
        await client.query(`INSERT INTO memberships (id, organization_id, user_id, role, status, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$6)`, [membership.id, membership.organizationId, membership.userId, membership.role, membership.status, membership.createdAt]);
      },
      async update(membership) {
        await client.query(`UPDATE memberships SET role=$1, status=$2, updated_at=CURRENT_TIMESTAMP
          WHERE id=$3 AND organization_id=$4`, [membership.role, membership.status, membership.id, membership.organizationId]);
      }
    },
    sessions: {
      async findByDigest(tokenDigest) {
        const result = await client.query("SELECT * FROM sessions WHERE token_digest = $1", [tokenDigest]);
        const row = result.rows[0];
        return row ? { id: row.id, organizationId: row.organization_id, membershipId: row.membership_id, userId: row.user_id,
          tokenDigest: row.token_digest, expiresAt: iso(row.expires_at), revokedAt: row.revoked_at ? iso(row.revoked_at) : null,
          createdAt: iso(row.created_at) } as Session : null;
      },
      async insert(session) {
        await client.query(`INSERT INTO sessions (id, organization_id, membership_id, user_id, token_digest, expires_at, revoked_at, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [session.id, session.organizationId, session.membershipId, session.userId,
          session.tokenDigest, session.expiresAt, session.revokedAt, session.createdAt]);
      },
      async revoke(sessionId, revokedAt) {
        await client.query("UPDATE sessions SET revoked_at=$1 WHERE id=$2", [revokedAt, sessionId]);
      },
      async revokeForMembership(membershipId, revokedAt) {
        const result = await client.query("UPDATE sessions SET revoked_at=$1 WHERE membership_id=$2 AND revoked_at IS NULL", [revokedAt, membershipId]);
        return result.rowCount ?? 0;
      },
      async revokeForUser(userId, revokedAt) {
        const result = await client.query("UPDATE sessions SET revoked_at=$1 WHERE user_id=$2 AND revoked_at IS NULL", [revokedAt, userId]);
        return result.rowCount ?? 0;
      }
    },
    invitations: {
      async findByDigest(tokenDigest) {
        const result = await client.query("SELECT * FROM invitations WHERE token_digest=$1", [tokenDigest]);
        const row = result.rows[0];
        return row ? { id: row.id, organizationId: row.organization_id, email: row.email, role: row.role,
          tokenDigest: row.token_digest, status: row.status, expiresAt: iso(row.expires_at),
          acceptedAt: row.accepted_at ? iso(row.accepted_at) : null, createdAt: iso(row.created_at) } as Invitation : null;
      },
      async insert(invitation) {
        await client.query(`INSERT INTO invitations (id, organization_id, email, role, token_digest, status, expires_at, accepted_at, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [invitation.id, invitation.organizationId, invitation.email, invitation.role,
          invitation.tokenDigest, invitation.status, invitation.expiresAt, invitation.acceptedAt, invitation.createdAt]);
      },
      async update(invitation) {
        await client.query(`UPDATE invitations SET status=$1, accepted_at=$2
          WHERE id=$3 AND organization_id=$4`, [invitation.status, invitation.acceptedAt, invitation.id, invitation.organizationId]);
      }
    },
    audit: {
      async append(event: AuditEvent) {
        await client.query(`INSERT INTO audit_events (id, organization_id, actor_user_id, action, target_type, target_id, occurred_at, metadata)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [event.id, event.organizationId, event.actorUserId, event.action,
          event.targetType, event.targetId, event.occurredAt, JSON.stringify(event.metadata)]);
      }
    }
  };
}

function mapMembership(row: Record<string, unknown> | undefined): Membership | null {
  if (!row) return null;
  return { id: row.id, organizationId: row.organization_id, userId: row.user_id, role: row.role,
    status: row.status, createdAt: iso(row.created_at as Date) } as Membership;
}

export class PostgresTransactionRunner implements TransactionRunner {
  constructor(private readonly pool: Pool) {}

  async run<T>(operation: (transaction: TransactionContext) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(context(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve original failure. */ }
      throw error;
    } finally { client.release(); }
  }
}
