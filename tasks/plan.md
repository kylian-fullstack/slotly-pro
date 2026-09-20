# Implementation Plan: identity-tenancy

Status: approved on 2026-09-20  
Specification: `SPEC-identity-tenancy.md`  
Date: 2026-09-20

## Outcome

Deliver the smallest production-shaped identity and tenant foundation that proves Slotly Pro can safely host multiple businesses. The slice ends with a Czech owner onboarding and member-management journey backed by real PostgreSQL transactions, revocable opaque sessions, append-only audit evidence and automated cross-tenant tests.

This plan implements only the approved `identity-tenancy` specification. Scheduling, services, availability and bookings remain outside this slice.

## Architecture decisions

### Runtime and workspace

- Node.js 24 and pnpm workspaces.
- Next.js 16 with React 19 for the web application and route handlers.
- Strict TypeScript throughout.
- PostgreSQL 18 as the only authoritative application database.
- Prisma 7 for typed queries and migrations, supplemented by reviewed SQL where a database invariant cannot be expressed safely through generated schema alone.
- Zod schemas in `packages/contracts` for HTTP inputs and outputs.
- Vitest for domain tests, a dedicated PostgreSQL test database for integration tests and Playwright for browser journeys.

Before bootstrap, resolve and record exact compatible package versions and licenses. Commit the lockfile; do not use floating dependency ranges in CI.

### Layers and dependency direction

```text
browser -> Next.js adapter -> application use case -> domain policy
                         \-> repository interface <- PostgreSQL adapter
```

- `packages/domain` contains entities, policies, errors, ports and use cases. It imports neither Next.js nor Prisma.
- `packages/contracts` owns externally visible schemas and stable error codes.
- `packages/db` implements domain ports and migrations.
- `apps/web` handles HTTP, cookies, CSRF/origin checks, Czech presentation and dependency composition.
- Transaction ownership sits at application-service level so the state mutation and audit event share one commit.

### Security model

- Authentication uses a random opaque bearer value in an `HttpOnly` cookie; PostgreSQL stores only its SHA-256 digest.
- Passwords use Argon2id. Parameters are calibrated once on the target runtime, recorded in configuration and encoded with each hash so they can be upgraded.
- State-changing browser requests require a CSRF token bound to the session plus same-origin validation.
- Organization context is selected only from the authenticated user's active memberships. Route parameters and request bodies never establish tenant authority.
- Authorization is deny-by-default. Inaccessible tenant resources map to the same `404` contract as nonexistent resources.
- Security logs contain request correlation IDs and stable error codes, never credentials, cookies, raw invitation tokens or password hashes.

## Delivery sequence

### Phase 0 — reproducible foundation

1. Create the pnpm workspace, TypeScript base configuration and package boundaries.
2. Add lint, typecheck, unit, integration and end-to-end commands named exactly as specified.
3. Add environment parsing that fails on missing or unsafe production values.
4. Add a local PostgreSQL development/test definition and separate database URLs. Tests must refuse to run destructive setup against a database not explicitly marked as test-only.
5. Add CI stages for install, lint, typecheck, unit tests, PostgreSQL integration tests, build and Playwright.

Evidence: a clean checkout can install from the lockfile and run the empty quality pipeline; production startup rejects test-seed configuration.

### Phase 1 — domain contracts and policy tests

1. Define branded IDs, UTC timestamps and normalized-email value objects.
2. Define `User`, `Organization`, `Membership`, `Session`, `Invitation` and `AuditEvent` domain shapes.
3. Define lifecycle statuses and the fixed `OWNER`, `ADMIN`, `STAFF` roles.
4. Implement named authorization policies for organization update, invitations, membership management and audit access.
5. Define typed use-case ports and stable domain errors.
6. Write the complete table-driven role matrix and invariant tests before adapters.

Evidence: domain tests prove deny-by-default behavior, inactive membership handling, email normalization and the intended permission matrix without framework or database dependencies.

### Phase 2 — PostgreSQL schema and transactional invariants

1. Create migrations for users, organizations, memberships, sessions, invitations, audit events and idempotency records.
2. Add primary keys, foreign keys, lifecycle checks and unique constraints for normalized email, organization slug and `(organization_id, user_id)`.
3. Make audit rows append-only through database privileges and a defensive trigger in environments where the application database role owns tables.
4. Implement repository adapters and a transaction runner.
5. Protect the last-active-owner invariant with an organization-scoped transactional lock followed by a count-and-mutate operation in the same transaction. All membership role/status/removal operations must use this path.
6. Implement idempotency records with request fingerprint, operation scope, terminal response and expiry. Reusing a key with a different request returns `IDEMPOTENCY_KEY_REUSED`.
7. Review the generated SQL before applying migrations.

Evidence: real PostgreSQL tests run two concurrent owner mutations and prove that at least one owner remains; schema constraints reject cross-organization links and duplicate memberships.

### Phase 3 — credentials and session lifecycle

1. Implement Argon2id hashing and verification behind a domain port.
2. Calibrate and document non-test password parameters; use intentionally cheaper explicit parameters only in tests.
3. Generate session tokens with a cryptographically secure source, persist only their digest and issue the raw value once in the cookie.
4. Implement constant-time digest comparison where comparisons occur in application code.
5. Implement login enumeration resistance, session expiry, rotation, logout and revocation.
6. Revoke relevant sessions after password changes, membership removal or privilege changes.
7. Add cookie construction, trusted-origin checks and synchronizer CSRF tokens.

Evidence: integration tests show that stolen database rows are insufficient to reconstruct a session; old tokens fail after rotation/revocation; login responses do not disclose email existence.

### Phase 4 — onboarding and invitations

1. Implement atomic first-owner registration: user, organization, owner membership and audit event.
2. Gate registration with `PUBLIC_REGISTRATION_ENABLED`; default to disabled unless explicitly enabled.
3. Implement owner/admin invitation authorization according to the approved matrix.
4. Generate invitation secrets once, persist only their digest and bind them to normalized email, organization, role and expiry.
5. Implement idempotent acceptance in one transaction, including user creation or verified existing-user attachment, membership creation and audit event.
6. Define stable behavior for expired, revoked, already accepted and email-mismatched invitations.

Evidence: concurrent/retried acceptance creates exactly one membership; invitation material never appears in persistence snapshots or logs.

### Phase 5 — versioned HTTP API

1. Implement a shared request pipeline: correlation ID, input parse, session lookup, tenant context, CSRF/origin checks, authorization and error mapping.
2. Implement the approved `/api/v1` endpoints without adding unreviewed capabilities.
3. Require idempotency keys for registration and invitation acceptance.
4. Return stable JSON envelopes and machine-readable errors.
5. Apply rate limits to login, registration and invitation acceptance. The adapter must support a shared production backend; an in-memory limiter is permitted only for local development and tests.
6. Add no-store response headers to session and security-sensitive endpoints.

Evidence: API tests cover every role, unauthenticated access, malformed input, cross-tenant resource probes, replay and CSRF rejection.

### Phase 6 — minimal Czech operator UI

1. Build focused screens for registration, login, current organization, member list, invitation creation/acceptance and security audit.
2. Derive visible actions from the same capability contract used by the API, while keeping server authorization authoritative.
3. Provide clear Czech error and recovery messages without leaking sensitive state.
4. Meet keyboard, focus, label and contrast basics; test at desktop and narrow mobile widths.
5. Do not create scheduling or dashboard theatre in this module.

Evidence: Playwright completes owner registration, invitation, administrator acceptance, permitted staff management and prohibited owner management.

### Phase 7 — hardening and acceptance evidence

1. Run dependency/license audit and secret scanning; resolve critical/high findings or record an explicit reviewed exception.
2. Exercise session fixation, CSRF, authorization bypass, cross-tenant enumeration and replay cases.
3. Verify production build and startup with production-safe configuration.
4. Produce an acceptance record containing command results, migration review, concurrency evidence and known boundaries.
5. Confirm that test seeds fail closed under production configuration and that no provider/compliance claim appears in UI or documentation.

Evidence: every success criterion in the approved spec has a named automated check or a documented manual verification result.

## Database consistency details

### Last-owner operation

For any demotion, suspension or deletion of an active owner:

1. begin a transaction;
2. lock the organization row with `SELECT ... FOR UPDATE`;
3. reload the actor and target memberships inside the transaction;
4. re-run authorization and count active owners;
5. reject when the target is an owner and the count is one;
6. write the mutation and audit event;
7. commit.

This serializes owner-count changes per organization without globally locking unrelated tenants.

### Tenant-safe relationships

Tenant-owned references use composite keys including `organization_id` where practical. Repository methods accept a `TenantContext` first and include `organization_id` in every scoped predicate. Tests inspect representative query behavior and attempt malicious cross-tenant identifiers.

### Audit integrity

Audit events are created from server-known actor and target context. Metadata follows a strict allowlist. The normal application role receives insert/select but not update/delete capability on audit rows; migration ownership is separated in production deployment guidance.

## API error contract

The initial stable error set is:

```text
AUTHENTICATION_REQUIRED
INVALID_CREDENTIALS
SESSION_EXPIRED
CSRF_REJECTED
FORBIDDEN
RESOURCE_NOT_FOUND
VALIDATION_FAILED
REGISTRATION_DISABLED
INVITATION_INVALID
INVITATION_EXPIRED
INVITATION_EMAIL_MISMATCH
LAST_OWNER_REQUIRED
IDEMPOTENCY_KEY_REQUIRED
IDEMPOTENCY_KEY_REUSED
RATE_LIMITED
CONFLICT
INTERNAL_ERROR
```

Messages may be localized; codes and HTTP semantics remain stable.

## Test matrix and gates

| Gate | Required proof |
|---|---|
| Static | lint and strict typecheck pass |
| Domain | every role/capability cell and lifecycle invariant covered |
| Database | migrations apply from empty DB and all integration tests use PostgreSQL |
| Concurrency | last-owner and invitation races tested with independent connections |
| API | authentication, authorization, validation, replay and error contracts pass |
| Browser | approved Czech onboarding/member journey passes on desktop and mobile viewport |
| Build | clean production build and safe startup pass |
| Security | no high/critical unresolved issue, secrets absent from logs, test controls fail closed |

A phase is not complete merely because code exists. Its named evidence must pass.

## Rollback and migration safety

- Schema migrations are additive until the module reaches acceptance.
- Every migration receives a forward recovery note; destructive automatic down-migrations are not used against production data.
- Application code must tolerate the immediately previous additive schema during deployment where possible.
- A failed identity transaction rolls back its audit event and idempotency terminal response together.
- Deployment of public registration remains independent from deployment of the code and stays disabled until explicitly enabled.

## Documentation produced during implementation

- root `README.md` with local setup and verified commands;
- `.env.example` containing names and safe explanations, never secrets;
- role and authorization matrix mirrored from the approved specification;
- migration review notes;
- threat model covering assets, trust boundaries and tested abuse cases;
- acceptance evidence listing exact checks and honest remaining boundaries.

## Explicitly deferred

- password reset and email verification delivery;
- OAuth, SSO, MFA and passkeys;
- native mobile applications;
- billing and subscription enforcement;
- services, resources, availability and booking data;
- live invitation email delivery;
- global support impersonation or universal administrator access.

Deferral means these capabilities are not claimed. Invitation acceptance can be tested by exposing the one-time URL only in controlled local/test fixtures until a provider module is reviewed.

## Review gate

After approval of this plan, create `tasks/todo.md` with small, ordered, verifiable tasks mapped to the phases and evidence above. Implementation begins only after that task list is reviewed.
