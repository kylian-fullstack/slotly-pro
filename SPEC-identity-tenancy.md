# SPEC: identity-tenancy

Status: approved on 2026-09-20  
Product: Slotly Pro  
Module: `identity-tenancy`  
Date: 2026-09-20

## 1. Objective

Build a trustworthy identity and tenant-isolation foundation for Slotly Pro. A person may belong to more than one organization, but every organization-scoped request must execute inside one verified membership context. No caller-supplied organization identifier may be trusted as authorization.

This module must prove:

- secure sign-in, sign-out, session rotation and revocation;
- atomic creation of the first user, organization and owner membership;
- invitation-based onboarding of administrators and staff;
- an explicit `OWNER`, `ADMIN`, `STAFF` authorization matrix;
- database-enforced tenant ownership and membership invariants;
- immutable audit evidence for security-sensitive changes;
- cross-tenant denial verified against a real PostgreSQL database.

This module does not implement services, staff calendars, availability, bookings, billing, OAuth, SSO, passkeys or MFA. Those are later modules or explicit product boundaries.

## 2. Commands

The repository will use Node.js 24, TypeScript, pnpm workspaces and PostgreSQL. Exact dependency versions will be locked in `pnpm-lock.yaml` during planning and bootstrap.

```powershell
# Install the locked dependency graph
pnpm install --frozen-lockfile

# Static checks
pnpm lint
pnpm typecheck

# Fast domain tests
pnpm test

# Real PostgreSQL integration tests
pnpm test:integration

# Browser-level identity journey
pnpm test:e2e

# Apply reviewed database migrations
pnpm db:migrate
```

No production migration, seed or destructive database reset may run as part of `dev`, `build`, `test` or application startup.

## 3. Project structure

```text
slotly-pro/
  apps/
    web/
      src/app/                  # Czech UI and HTTP route adapters
      src/server/               # request context, cookies and composition root
  packages/
    contracts/                  # versioned request/response schemas
    domain/
      src/identity-tenancy/     # entities, policies and use cases
    db/
      migrations/               # reviewed PostgreSQL migrations
      src/identity-tenancy/     # repository implementations
  tests/
    integration/identity-tenancy/
    e2e/identity-tenancy/
  tasks/
    plan.md
    todo.md
```

Dependency direction is strict: HTTP/UI adapters depend on application use cases; use cases depend on domain interfaces; PostgreSQL and session implementations satisfy those interfaces. The domain package must not import the web framework or database client.

## 4. Domain and contracts

### 4.1 Entities

- `User`: globally unique normalized email, display name, password credential state and lifecycle status.
- `Organization`: immutable ID, unique slug, display name, IANA default timezone and lifecycle status.
- `Membership`: unique `(organizationId, userId)` pair, role and status.
- `Session`: user ID, hashed opaque token, expiry, rotation/revocation state and minimal security metadata.
- `Invitation`: organization, normalized target email, intended role, hashed single-use token, expiry and acceptance/revocation state.
- `AuditEvent`: organization where applicable, actor, action, target, timestamp and structured non-secret metadata. Audit events are append-only.

All IDs are generated server-side. Timestamps are stored in UTC. Organization timezones use IANA identifiers; the initial default is `Europe/Prague`.

### 4.2 Roles

| Capability | OWNER | ADMIN | STAFF |
|---|---:|---:|---:|
| Read organization profile | Yes | Yes | Yes |
| Update organization profile | Yes | Yes | No |
| Invite or manage STAFF | Yes | Yes | No |
| Invite or manage ADMIN | Yes | No | No |
| Promote, demote or remove OWNER | Yes, subject to last-owner rule | No | No |
| Read security audit | Yes | Yes | No |

The final active owner cannot be removed, suspended or demoted. The rule must be protected transactionally, not only by a UI check.

### 4.3 Authentication and sessions

- Passwords use an audited Argon2id implementation with unique salts. Exact parameters and upgrade policy belong in the implementation plan and must be covered by tests.
- A server-generated high-entropy opaque session token is stored in an `HttpOnly` cookie. Only its cryptographic hash is stored in PostgreSQL.
- Production cookies are `Secure`, `HttpOnly` and `SameSite=Lax`, with a narrow path and an explicit expiry.
- Login rotates the session. Password changes, membership removal and material privilege changes revoke affected sessions.
- State-changing browser requests require same-origin validation and a CSRF token.
- Authentication errors do not reveal whether an email address exists.
- Tokens, passwords, cookie values and password hashes never appear in logs or audit metadata.

### 4.4 Tenant boundary

The authenticated request context derives the active organization from a valid session plus an active membership. Repositories that access organization-owned records require a typed tenant context; public APIs do not accept `organizationId` as proof of access.

Looking up an inaccessible resource returns the same not-found response as a nonexistent resource. Every later tenant-owned table must contain `organization_id`, appropriate composite uniqueness constraints and foreign-key relationships that prevent linking records across organizations.

### 4.5 Onboarding and invitations

- Initial owner registration creates `User`, `Organization`, `Membership(OWNER)` and its audit event in one transaction.
- Public owner registration is controlled by `PUBLIC_REGISTRATION_ENABLED` and defaults to disabled outside explicitly configured environments.
- Additional users join through single-use, expiring invitations.
- Invitation tokens are stored only as hashes. Repeated acceptance of the same token has one stable outcome and creates no duplicate membership.
- An invitation is bound to the normalized target email and organization.
- Local and test seed endpoints exist only behind `TEST_SEED_ENABLED`; production fails closed if enabled accidentally.

### 4.6 HTTP API

All responses use versioned schemas and stable machine-readable error codes.

```text
POST   /api/v1/registration
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/session
GET    /api/v1/organizations/current
PATCH  /api/v1/organizations/current
POST   /api/v1/members/invitations
POST   /api/v1/invitations/{token}/accept
PATCH  /api/v1/members/{membershipId}
DELETE /api/v1/members/{membershipId}
GET    /api/v1/audit
```

Write operations accept an idempotency key where a network retry could otherwise create duplicate state, notably registration and invitation acceptance.

## 5. Code style

- TypeScript strict mode; no untyped request bodies and no `any` at domain boundaries.
- Domain names and API identifiers are English; end-user copy is Czech.
- Functions remain small and explicit. Authorization policies are named domain functions, not scattered conditionals.
- Expected failures use typed results or domain errors; adapters translate them to stable HTTP errors.
- Transactions are opened in application services and include the state change plus its audit event.

Representative style:

```ts
export function canManageMembership(
  actor: Membership,
  target: Membership,
  nextRole: MembershipRole,
): AuthorizationDecision {
  if (!actor.isActive || actor.organizationId !== target.organizationId) {
    return { allowed: false, reason: "TENANT_BOUNDARY" };
  }

  if (actor.role === "STAFF") {
    return { allowed: false, reason: "INSUFFICIENT_ROLE" };
  }

  if (actor.role === "ADMIN" && (target.role !== "STAFF" || nextRole !== "STAFF")) {
    return { allowed: false, reason: "OWNER_REQUIRED" };
  }

  return { allowed: true };
}
```

The database transaction still enforces the last-owner invariant; this policy function is not the final consistency gate.

## 6. Testing strategy

### Domain tests

- full role/capability authorization matrix;
- email normalization and invitation binding;
- inactive membership and expired/revoked invitation behavior;
- last-owner decisions and stable domain error codes.

### PostgreSQL integration tests

- first-owner registration is atomic under failure;
- unique email, slug and membership constraints behave as specified;
- simultaneous owner demotions/removals cannot leave an organization ownerless;
- invitation acceptance is single-use and retry-safe under concurrency;
- session token lookup, rotation, expiry and revocation work using hashes;
- a user from organization A cannot read or mutate organization B records;
- state changes and their audit events commit or roll back together.

SQLite, mocks and in-memory repositories do not count as proof of database concurrency or tenant isolation.

### End-to-end tests

- owner registers when the feature flag is enabled, signs in and signs out;
- owner invites an administrator, who accepts and obtains only allowed permissions;
- administrator invites and manages staff but cannot manage owners;
- disabled public registration and disabled test seeds fail closed;
- cross-tenant URLs do not disclose resource existence.

## 7. Boundaries

### Always

- derive tenant context from authenticated membership;
- validate inputs at the HTTP boundary and enforce invariants again in the domain/database;
- use real PostgreSQL for integration and concurrency evidence;
- record security-sensitive mutations in the append-only audit log;
- redact credentials and tokens from errors, logs and telemetry;
- use migrations for schema changes and review generated SQL.

### Ask first

- enabling public registration in a deployed environment;
- adding an external identity provider, email provider or paid service;
- changing role powers or introducing a new role;
- weakening session, password, CSRF or tenant-isolation controls;
- running a destructive migration or production data repair.

### Never

- trust an `organizationId`, role or user ID supplied by the client as authorization;
- store plaintext passwords, invitation tokens or session tokens;
- expose whether a login email exists;
- allow the final active owner to be removed or demoted;
- create a hidden universal administrator or cross-tenant backdoor;
- enable test seed/reset routes in production;
- claim OAuth, MFA, live email delivery or compliance certification in this module.

## 8. Success criteria

This specification is complete when all of the following are demonstrated:

1. A feature-flagged registration creates the owner and organization atomically.
2. Opaque sessions can be rotated and revoked without storing their plaintext secrets.
3. The role matrix is enforced consistently by API tests.
4. Concurrent attempts cannot remove or demote the last active owner.
5. Invitation acceptance is expiring, single-use and retry-safe.
6. Cross-tenant reads and writes fail without disclosing whether the target exists.
7. Every security-sensitive successful mutation has a corresponding committed audit event.
8. Lint, strict type checking, domain tests, PostgreSQL integration tests and the identity browser journey are green.
9. The implementation contains no production-enabled seed path and no real provider claims.

## 9. Proposed decisions for review

Unless changed during review, the implementation plan will treat these as approved decisions:

- self-service owner registration exists but defaults to disabled outside configured environments;
- administrators and staff join only through invitations;
- sessions are opaque, database-backed and revocable rather than JWT-based;
- MFA, OAuth, SSO and passkeys are deferred beyond the first slice;
- `Europe/Prague` is the initial organization timezone, while all timestamps remain UTC.

## 10. Open questions

No blocking product question remains for this module. Human approval of this specification is required before creating `tasks/plan.md`; implementation must not begin before the plan and task list are subsequently reviewed.
