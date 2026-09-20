import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { MembershipStore } from "../../../packages/db/src/identity-tenancy/membership-store";
import { InvitationStore } from "../../../packages/db/src/identity-tenancy/invitation-store";
import { IdempotencyStore } from "../../../packages/db/src/identity-tenancy/idempotency-store";
import { RegistrationStore } from "../../../packages/db/src/identity-tenancy/registration-store";
import { SessionStore } from "../../../packages/db/src/identity-tenancy/session-store";
import { RateLimitStore } from "../../../packages/db/src/identity-tenancy/rate-limit-store";
import { PostgresTransactionRunner } from "../../../packages/db/src/identity-tenancy/transaction-runner";
import type { AuditEvent, TenantContext, User } from "@slotly/domain";

const { Pool } = pg;
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL is required for integration tests.");
const pool = new Pool({ connectionString, max: 8 });

async function createUser(email: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO users (id, email, display_name, password_hash, updated_at) VALUES ($1, $2, 'Test User', 'test-only-password-hash', CURRENT_TIMESTAMP)",
    [id, email]
  );
  return id;
}

async function createOrganization(slug: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO organizations (id, slug, display_name, updated_at) VALUES ($1, $2, 'Test Organization', CURRENT_TIMESTAMP)",
    [id, slug]
  );
  return id;
}

async function createMembership(organizationId: string, userId: string, role: "OWNER" | "ADMIN" | "STAFF"): Promise<string> {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO memberships (id, organization_id, user_id, role, updated_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)",
    [id, organizationId, userId, role]
  );
  return id;
}

describe("PostgreSQL identity invariants", () => {
  beforeAll(async () => {
    const guard = await pool.query(
      "SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()"
    );
    expect(guard.rows[0]?.marker).toBe("slotly_test_only");
  });
  afterAll(async () => pool.end());

  it("rejects a session that mixes membership and organization tenants", async () => {
    const suffix = randomUUID().slice(0, 8);
    const userId = await createUser(`tenant-${suffix}@example.test`);
    const organizationA = await createOrganization(`tenant-a-${suffix}`);
    const organizationB = await createOrganization(`tenant-b-${suffix}`);
    const membershipA = await createMembership(organizationA, userId, "OWNER");
    await expect(pool.query(
      "INSERT INTO sessions (id, organization_id, membership_id, user_id, token_digest, expires_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP + interval '1 hour')",
      [randomUUID(), organizationB, membershipA, userId, "a".repeat(64)]
    )).rejects.toMatchObject({ code: "23503" });
  });

  it("prevents updates and deletion of audit events", async () => {
    const suffix = randomUUID().slice(0, 8);
    const organizationId = await createOrganization(`audit-${suffix}`);
    const eventId = randomUUID();
    await pool.query(
      "INSERT INTO audit_events (id, organization_id, action, target_type, target_id) VALUES ($1, $2, 'organization.created', 'organization', $3)",
      [eventId, organizationId, organizationId]
    );
    await expect(pool.query("UPDATE audit_events SET action = 'tampered' WHERE id = $1", [eventId])).rejects.toMatchObject({ code: "55000" });
    await expect(pool.query("DELETE FROM audit_events WHERE id = $1", [eventId])).rejects.toMatchObject({ code: "55000" });
  });

  it("serializes concurrent owner demotions and retains one active owner", async () => {
    const suffix = randomUUID().slice(0, 8);
    const organizationId = await createOrganization(`owners-${suffix}`);
    const firstUser = await createUser(`owner-a-${suffix}@example.test`);
    const secondUser = await createUser(`owner-b-${suffix}@example.test`);
    const firstMembership = await createMembership(organizationId, firstUser, "OWNER");
    const secondMembership = await createMembership(organizationId, secondUser, "OWNER");
    const store = new MembershipStore(pool);
    const outcomes = await Promise.allSettled([
      store.changeRole({ organizationId, targetMembershipId: firstMembership, nextRole: "ADMIN" }),
      store.changeRole({ organizationId, targetMembershipId: secondMembership, nextRole: "ADMIN" })
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    const owners = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM memberships WHERE organization_id = $1 AND role = 'OWNER' AND status = 'ACTIVE'",
      [organizationId]
    );
    expect(owners.rows[0]?.count).toBe("1");
  });

  it("stores only a digest and invalidates old tokens after rotation and revocation", async () => {
    const suffix = randomUUID().slice(0, 8);
    const organizationId = await createOrganization(`sessions-${suffix}`);
    const userId = await createUser(`session-${suffix}@example.test`);
    const membershipId = await createMembership(organizationId, userId, "OWNER");
    const store = new SessionStore(pool);
    const rawToken = `raw-${randomUUID()}`;
    const digest = createHash("sha256").update(rawToken).digest("hex");
    const firstId = randomUUID();
    await store.create({
      id: firstId, organizationId, membershipId, userId, tokenDigest: digest,
      expiresAt: new Date(Date.now() + 3_600_000)
    });
    const persisted = await pool.query<{ token_digest: string }>("SELECT token_digest FROM sessions WHERE id = $1", [firstId]);
    expect(persisted.rows[0]?.token_digest).toBe(digest);
    expect(persisted.rows[0]?.token_digest).not.toContain(rawToken);
    await expect(store.findActiveByDigest(digest)).resolves.toMatchObject({ id: firstId, role: "OWNER" });

    const nextRawToken = `raw-${randomUUID()}`;
    const nextDigest = createHash("sha256").update(nextRawToken).digest("hex");
    const nextId = randomUUID();
    await store.rotate(digest, {
      id: nextId, organizationId, membershipId, userId, tokenDigest: nextDigest,
      expiresAt: new Date(Date.now() + 3_600_000)
    });
    await expect(store.findActiveByDigest(digest)).resolves.toBeNull();
    await expect(store.findActiveByDigest(nextDigest)).resolves.toMatchObject({ id: nextId });
    await store.revoke(nextId);
    await expect(store.findActiveByDigest(nextDigest)).resolves.toBeNull();

    const expiredDigest = createHash("sha256").update(`expired-${randomUUID()}`).digest("hex");
    await pool.query(
      `INSERT INTO sessions
        (id, organization_id, membership_id, user_id, token_digest, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP - interval '1 second', CURRENT_TIMESTAMP - interval '1 hour')`,
      [randomUUID(), organizationId, membershipId, userId, expiredDigest]
    );
    await expect(store.findActiveByDigest(expiredDigest)).resolves.toBeNull();
  });

  it("registers user, organization, owner membership and audit atomically", async () => {
    const suffix = randomUUID().slice(0, 8);
    const store = new RegistrationStore(pool);
    const record = {
      userId: randomUUID(), organizationId: randomUUID(), membershipId: randomUUID(), auditEventId: randomUUID(),
      email: `registered-${suffix}@example.test`, displayName: "Registered Owner", passwordHash: "test-hash",
      organizationName: "Registered Studio", organizationSlug: `registered-${suffix}`, timezone: "Europe/Prague"
    };
    await store.registerOwner(record);
    const proof = await pool.query<{ users: string; organizations: string; owners: string; audits: string }>(
      `SELECT
        (SELECT count(*) FROM users WHERE id = $1)::text AS users,
        (SELECT count(*) FROM organizations WHERE id = $2)::text AS organizations,
        (SELECT count(*) FROM memberships WHERE id = $3 AND role = 'OWNER')::text AS owners,
        (SELECT count(*) FROM audit_events WHERE id = $4)::text AS audits`,
      [record.userId, record.organizationId, record.membershipId, record.auditEventId]
    );
    expect(proof.rows[0]).toEqual({ users: "1", organizations: "1", owners: "1", audits: "1" });
  });

  it("rolls back the complete registration when organization creation fails", async () => {
    const suffix = randomUUID().slice(0, 8);
    const duplicateSlug = `duplicate-${suffix}`;
    await createOrganization(duplicateSlug);
    const store = new RegistrationStore(pool);
    const email = `rollback-${suffix}@example.test`;
    await expect(store.registerOwner({
      userId: randomUUID(), organizationId: randomUUID(), membershipId: randomUUID(), auditEventId: randomUUID(),
      email, displayName: "Rollback Owner", passwordHash: "test-hash",
      organizationName: "Duplicate Studio", organizationSlug: duplicateSlug, timezone: "Europe/Prague"
    })).rejects.toMatchObject({ code: "23505" });
    const user = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    expect(user.rowCount).toBe(0);
  });

  it("accepts an invitation once and returns a stable concurrent replay", async () => {
    const suffix = randomUUID().slice(0, 8);
    const organizationId = await createOrganization(`invite-${suffix}`);
    const store = new InvitationStore(pool);
    const rawToken = `invite-${randomUUID()}`;
    const tokenDigest = createHash("sha256").update(rawToken).digest("hex");
    const email = `invited-${suffix}@example.test`;
    await store.create({
      id: randomUUID(), organizationId, email, role: "STAFF", tokenDigest,
      expiresAt: new Date(Date.now() + 3_600_000)
    });
    const input = {
      tokenDigest, email, userId: randomUUID(), membershipId: randomUUID(), auditEventId: randomUUID(),
      displayName: "Invited User", passwordHash: "test-hash"
    };
    const results = await Promise.all([store.accept(input), store.accept(input)]);
    expect(results.filter((result) => result.replayed)).toHaveLength(1);
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    const proof = await pool.query<{ users: string; memberships: string; invitations: string }>(
      `SELECT
        (SELECT count(*) FROM users WHERE email = $1)::text AS users,
        (SELECT count(*) FROM memberships WHERE organization_id = $2 AND user_id = $3)::text AS memberships,
        (SELECT count(*) FROM invitations WHERE token_digest = $4 AND status = 'ACCEPTED')::text AS invitations`,
      [email, organizationId, input.userId, tokenDigest]
    );
    expect(proof.rows[0]).toEqual({ users: "1", memberships: "1", invitations: "1" });
    const persisted = await pool.query<{ token_digest: string }>("SELECT token_digest FROM invitations WHERE token_digest = $1", [tokenDigest]);
    expect(persisted.rows[0]?.token_digest).toBe(tokenDigest);
    expect(persisted.rows[0]?.token_digest).not.toContain(rawToken);
  });

  it("returns stable errors for invalid, mismatched, expired and revoked invitations", async () => {
    const suffix = randomUUID().slice(0, 8);
    const organizationId = await createOrganization(`invite-errors-${suffix}`);
    const store = new InvitationStore(pool);
    const base = {
      email: `expected-${suffix}@example.test`, userId: randomUUID(), membershipId: randomUUID(),
      auditEventId: randomUUID(), displayName: "Expected User", passwordHash: "test-hash"
    };
    await expect(store.accept({ ...base, tokenDigest: "f".repeat(64) })).rejects.toMatchObject({ code: "INVITATION_INVALID" });

    const validDigest = createHash("sha256").update(`valid-${suffix}`).digest("hex");
    await store.create({ id: randomUUID(), organizationId, email: base.email, role: "STAFF", tokenDigest: validDigest, expiresAt: new Date(Date.now() + 3_600_000) });
    await expect(store.accept({ ...base, email: `wrong-${suffix}@example.test`, tokenDigest: validDigest })).rejects.toMatchObject({ code: "INVITATION_EMAIL_MISMATCH" });

    const expiredDigest = createHash("sha256").update(`expired-invite-${suffix}`).digest("hex");
    await pool.query(
      `INSERT INTO invitations (id, organization_id, email, role, token_digest, created_at, expires_at)
       VALUES ($1, $2, $3, 'STAFF', $4, CURRENT_TIMESTAMP - interval '2 hours', CURRENT_TIMESTAMP - interval '1 hour')`,
      [randomUUID(), organizationId, base.email, expiredDigest]
    );
    await expect(store.accept({ ...base, tokenDigest: expiredDigest })).rejects.toMatchObject({ code: "INVITATION_EXPIRED" });

    const revokedDigest = createHash("sha256").update(`revoked-invite-${suffix}`).digest("hex");
    await store.create({ id: randomUUID(), organizationId, email: base.email, role: "STAFF", tokenDigest: revokedDigest, expiresAt: new Date(Date.now() + 3_600_000) });
    await pool.query("UPDATE invitations SET status = 'REVOKED' WHERE token_digest = $1", [revokedDigest]);
    await expect(store.accept({ ...base, tokenDigest: revokedDigest })).rejects.toMatchObject({ code: "INVITATION_INVALID" });
  });

  it("revokes active sessions immediately after a membership is suspended", async () => {
    const suffix = randomUUID().slice(0, 8);
    const organizationId = await createOrganization(`suspend-${suffix}`);
    const ownerId = await createUser(`suspend-owner-${suffix}@example.test`);
    await createMembership(organizationId, ownerId, "OWNER");
    const staffId = await createUser(`suspend-staff-${suffix}@example.test`);
    const staffMembership = await createMembership(organizationId, staffId, "STAFF");
    const sessions = new SessionStore(pool);
    const digest = createHash("sha256").update(`suspend-${suffix}`).digest("hex");
    await sessions.create({
      id: randomUUID(), organizationId, membershipId: staffMembership, userId: staffId,
      tokenDigest: digest, expiresAt: new Date(Date.now() + 3_600_000)
    });
    await expect(sessions.findActiveByDigest(digest)).resolves.not.toBeNull();
    await new MembershipStore(pool).changeStatus({ organizationId, targetMembershipId: staffMembership, nextStatus: "SUSPENDED" });
    await expect(sessions.findActiveByDigest(digest)).resolves.toBeNull();
  });

  it("executes an idempotent operation once and rejects changed request reuse", async () => {
    const suffix = randomUUID();
    const store = new IdempotencyStore(pool);
    let executions = 0;
    const operation = async () => {
      executions += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { status: 201, body: { id: suffix } };
    };
    const [first, second] = await Promise.all([
      store.run("registration", `key-${suffix}`, "a".repeat(64), new Date(Date.now() + 3_600_000), operation),
      store.run("registration", `key-${suffix}`, "a".repeat(64), new Date(Date.now() + 3_600_000), operation)
    ]);
    expect(executions).toBe(1);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    await expect(store.run(
      "registration", `key-${suffix}`, "b".repeat(64), new Date(Date.now() + 3_600_000), operation
    )).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("enforces a shared rate threshold and recovers in the next window", async () => {
    const store = new RateLimitStore(pool);
    const key = createHash("sha256").update(randomUUID()).digest("hex");
    const now = new Date("2026-09-20T07:00:10.000Z");
    await expect(store.consume(key, 2, 60, now)).resolves.toMatchObject({ allowed: true });
    await expect(store.consume(key, 2, 60, now)).resolves.toMatchObject({ allowed: true });
    await expect(store.consume(key, 2, 60, now)).resolves.toMatchObject({ allowed: false });
    await expect(store.consume(key, 2, 60, new Date("2026-09-20T07:01:01.000Z"))).resolves.toMatchObject({ allowed: true });
  });

  it("scopes typed repository reads to the supplied tenant context", async () => {
    const suffix = randomUUID().slice(0, 8);
    const organizationA = await createOrganization(`typed-a-${suffix}`);
    const organizationB = await createOrganization(`typed-b-${suffix}`);
    const userA = await createUser(`typed-a-${suffix}@example.test`);
    const userB = await createUser(`typed-b-${suffix}@example.test`);
    const membershipA = await createMembership(organizationA, userA, "OWNER");
    await createMembership(organizationB, userB, "OWNER");
    const tenant = { organizationId: organizationA, actorUserId: userA,
      membership: { id: membershipA, organizationId: organizationA, userId: userA, role: "OWNER", status: "ACTIVE", createdAt: new Date().toISOString() }
    } as unknown as TenantContext;
    const memberships = await new PostgresTransactionRunner(pool).run((transaction) => transaction.memberships.listForOrganization(tenant));
    expect(memberships).toHaveLength(1);
    expect(String(memberships[0]?.organizationId)).toBe(organizationA);
  });

  it("rolls back repository state and audit together after an application failure", async () => {
    const suffix = randomUUID().slice(0, 8);
    const userId = randomUUID();
    const auditId = randomUUID();
    const now = new Date().toISOString();
    await expect(new PostgresTransactionRunner(pool).run(async (transaction) => {
      await transaction.users.insert({ id: userId, email: `tx-${suffix}@example.test`, displayName: "Transaction User",
        passwordHash: "test-hash", status: "ACTIVE", createdAt: now } as unknown as User);
      await transaction.audit.append({ id: auditId, organizationId: null, actorUserId: userId,
        action: "transaction.test", targetType: "user", targetId: userId, occurredAt: now, metadata: {} } as unknown as AuditEvent);
      throw new Error("forced rollback");
    })).rejects.toThrow("forced rollback");
    const proof = await pool.query<{ users: string; audits: string }>(
      `SELECT (SELECT count(*) FROM users WHERE id=$1)::text AS users,
              (SELECT count(*) FROM audit_events WHERE id=$2)::text AS audits`, [userId, auditId]
    );
    expect(proof.rows[0]).toEqual({ users: "0", audits: "0" });
  });
});
