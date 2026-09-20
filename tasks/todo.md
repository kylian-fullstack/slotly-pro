# Task List: identity-tenancy

Status: approved on 2026-09-20; implementation in progress  
Specification: `../SPEC-identity-tenancy.md`  
Plan: `plan.md`  
Date: 2026-09-20

## Working rules

- Execute tasks in order unless a dependency is explicitly absent.
- Mark a task complete only after its stated evidence passes.
- Keep commits and changes scoped to one coherent task group.
- Stop and revise the specification or plan if implementation reveals a product-level contradiction.
- Never enable public registration, test seeds or destructive database operations in production by default.
- Do not claim a capability that has not crossed its evidence gate.

## 0. Reproducible foundation

- [x] **T001 — Record toolchain versions and licenses**
  - Resolve compatible exact versions for Node.js 24, pnpm, Next.js 16, React 19, TypeScript, Prisma 7, PostgreSQL 18, Zod, Vitest and Playwright.
  - Record direct dependency licenses and reject an incompatible production dependency.
  - Evidence: reviewed version table and license check committed with the initial lockfile.

- [x] **T002 — Bootstrap the pnpm workspace**
  - Create `apps/web`, `packages/contracts`, `packages/domain`, `packages/db` and shared TypeScript configuration.
  - Add root commands `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `build` and `db:migrate`.
  - Evidence: clean install and every empty quality command exits successfully.

- [x] **T003 — Enforce package boundaries**
  - Configure lint rules and TypeScript project references so the domain cannot import Next.js or Prisma.
  - Evidence: a temporary forbidden-import fixture fails the check, then is removed.

- [x] **T004 — Add validated environment configuration**
  - Parse environment variables once at startup with separate server and public schemas.
  - Reject unsafe production combinations, especially `TEST_SEED_ENABLED=true`.
  - Add `.env.example` without secrets.
  - Evidence: configuration tests cover missing secrets, invalid database URLs and production seed rejection.

- [x] **T005 — Provision isolated local and test PostgreSQL**
  - Add a reproducible PostgreSQL 18 development/test service definition.
  - Require an explicit test-database marker before reset or destructive test setup.
  - Evidence: test setup refuses a non-test database and successfully recreates the marked test database.

- [x] **T006 — Establish continuous integration**
  - Add locked install, lint, typecheck, unit, PostgreSQL integration, build and Playwright stages.
  - Cache only safe reproducible artifacts.
  - Evidence: the initial pipeline passes from a clean checkout.

## 1. Domain contracts and policies

- [x] **T101 — Define shared value objects**
  - Add branded identifiers, UTC timestamp helpers, email normalization and IANA timezone validation.
  - Evidence: unit tests include Unicode/case/whitespace email cases and invalid timezone rejection.

- [x] **T102 — Define identity-tenancy entities**
  - Add typed shapes for `User`, `Organization`, `Membership`, `Session`, `Invitation` and `AuditEvent`.
  - Define explicit statuses and `OWNER`, `ADMIN`, `STAFF` roles.
  - Evidence: strict typecheck passes and invalid state construction is covered by domain tests.

- [x] **T103 — Define stable errors and result contracts**
  - Implement the approved machine-readable error set without framework dependencies.
  - Evidence: exhaustive error-to-category test prevents an unhandled domain error.

- [x] **T104 — Implement authorization policies**
  - Add named policies for organization updates, invitations, membership changes and audit access.
  - Deny inactive actors and cross-organization targets before role evaluation.
  - Evidence: table-driven tests cover every cell of the approved role matrix.

- [x] **T105 — Define use-case ports**
  - Define repositories, transaction runner, clock, secret generator, password hasher and audit writer interfaces.
  - Evidence: domain package tests compile and run without web or database packages.

## 2. PostgreSQL schema and adapters

- [x] **T201 — Create the initial identity schema migration**
  - Add users, organizations, memberships, sessions, invitations, audit events and idempotency records.
  - Include required primary, foreign, unique and check constraints.
  - Evidence: reviewed SQL applies successfully to an empty PostgreSQL 18 database.

- [x] **T202 — Enforce tenant-safe relationships**
  - Use organization-aware composite relationships for tenant-owned links where applicable.
  - Evidence: direct SQL attempts to create cross-tenant relationships fail.

- [x] **T203 — Protect audit immutability**
  - Add production-role privileges and a defensive update/delete rejection mechanism.
  - Evidence: application-role insert/select succeeds while update/delete fails.

- [x] **T204 — Implement typed PostgreSQL repositories**
  - Require `TenantContext` as the first argument for organization-scoped repository operations.
  - Include `organization_id` in every scoped predicate.
  - Evidence: repository integration tests cover allowed and cross-tenant identifiers.

- [x] **T205 — Implement application transaction runner**
  - Ensure repositories and audit writer share the same transaction.
  - Evidence: forced failure rolls back both state mutation and audit event.

- [x] **T206 — Enforce the last-active-owner invariant**
  - Lock the organization row, reload memberships, reauthorize, count owners and mutate inside one transaction.
  - Evidence: independent concurrent connections cannot leave an organization ownerless.

- [x] **T207 — Implement idempotency storage**
  - Store operation scope, key, request fingerprint, outcome and expiry.
  - Return the previous result for a matching replay and `IDEMPOTENCY_KEY_REUSED` for a mismatched payload.
  - Evidence: sequential and concurrent replay tests pass.

## 3. Credentials and sessions

- [x] **T301 — Implement Argon2id password service**
  - Calibrate production parameters, encode parameters in hashes and define upgrade detection.
  - Use explicit cheaper parameters only in tests.
  - Evidence: correct, incorrect, malformed and upgrade-required hash tests pass.

- [x] **T302 — Implement opaque session secrets**
  - Generate high-entropy tokens and persist only SHA-256 digests.
  - Evidence: database inspection contains no raw token and the raw token authenticates exactly once as issued.

- [x] **T303 — Implement session lifecycle**
  - Add creation, lookup, expiry, rotation, logout and revocation.
  - Evidence: old tokens fail after rotation, logout and forced revocation.

- [x] **T304 — Implement secure cookie policy**
  - Set `HttpOnly`, production `Secure`, `SameSite=Lax`, narrow path and explicit expiry.
  - Evidence: adapter tests assert development and production cookie attributes.

- [x] **T305 — Implement CSRF and origin protection**
  - Bind synchronizer tokens to sessions and reject untrusted origins on browser mutations.
  - Evidence: missing, incorrect and cross-origin requests fail without mutation.

- [x] **T306 — Add login enumeration resistance**
  - Produce the same public error shape for unknown email and incorrect password and perform comparable password work.
  - Evidence: contract tests show identical status/code/body and no email-existence logging.

## 4. Registration and invitations

- [x] **T401 — Implement atomic first-owner registration**
  - Create the user, organization, owner membership and audit event in one transaction.
  - Evidence: success creates all four records; injected failure creates none.

- [x] **T402 — Gate public registration**
  - Default registration to disabled unless explicitly enabled.
  - Evidence: disabled registration returns `REGISTRATION_DISABLED` and performs no write.

- [x] **T403 — Implement invitation creation**
  - Enforce the role matrix, bind organization/email/role/expiry and persist only the token digest.
  - Evidence: owner/admin permission cases pass and persistence/log inspection reveals no raw token.

- [x] **T404 — Implement invitation acceptance**
  - Validate token, expiry and normalized email; attach or create a user and create one membership atomically.
  - Evidence: valid, invalid, expired, revoked and email-mismatch tests return stable outcomes.

- [x] **T405 — Make acceptance retry-safe**
  - Combine invitation state and idempotency records in the acceptance transaction.
  - Evidence: concurrent identical acceptance creates exactly one membership and a stable replay response.

- [x] **T406 — Revoke sessions after privilege changes**
  - Revoke affected organization sessions after member removal, suspension, promotion or demotion.
  - Evidence: a previously authorized session loses its old capability immediately after change.

## 5. Versioned HTTP API

- [x] **T501 — Define request and response schemas**
  - Add Zod contracts for every approved `/api/v1` endpoint and the stable JSON envelope.
  - Evidence: valid fixtures parse and malformed/extra security-sensitive fields fail predictably.

- [x] **T502 — Build the shared request pipeline**
  - Add correlation ID, parsing, session lookup, tenant derivation, CSRF/origin check, authorization and error mapping.
  - Evidence: adapter tests prove the ordering prevents unauthorized repository calls.

- [x] **T503 — Implement registration and auth endpoints**
  - Add registration, login, logout and current-session routes.
  - Require idempotency for registration.
  - Evidence: API integration tests cover success, replay, invalid credentials and disabled registration.

- [x] **T504 — Implement current-organization endpoints**
  - Add read and update routes using only derived tenant context.
  - Evidence: cross-tenant identifiers cannot change the selected organization.

- [x] **T505 — Implement membership and invitation endpoints**
  - Add invitation creation/acceptance and membership update/delete routes.
  - Evidence: every role and last-owner case is exercised through HTTP.

- [x] **T506 — Implement audit endpoint**
  - Return tenant-scoped, paginated audit events only to approved roles.
  - Evidence: staff is denied and no organization can observe another's events.

- [x] **T507 — Add rate limiting and sensitive-response headers**
  - Limit login, registration and invitation acceptance; add `Cache-Control: no-store` where required.
  - Evidence: threshold/recovery tests pass and production configuration rejects an unsupported in-memory limiter.

- [x] **T508 — Complete API abuse tests**
  - Test authentication absence, malformed input, CSRF, origin, replay, cross-tenant enumeration and error redaction.
  - Evidence: the complete API suite passes against PostgreSQL.

## 6. Minimal Czech operator UI

- [x] **T601 — Establish accessible UI shell**
  - Add Czech navigation, session-aware layout, skip link, focus styling and responsive foundation.
  - Evidence: keyboard navigation and automated accessibility smoke checks pass.

- [x] **T602 — Build registration and login screens**
  - Display truthful disabled-registration and generic authentication errors.
  - Evidence: browser tests cover enabled/disabled registration, login and logout.

- [x] **T603 — Build organization and member screens**
  - Show organization details, memberships and only actions appropriate to the current role.
  - Evidence: owner, admin and staff screenshots/actions match the approved matrix.

- [x] **T604 — Build invitation flow**
  - Add invitation creation and token acceptance screens without claiming live email delivery.
  - Evidence: controlled test invitation URL completes the browser journey.

- [x] **T605 — Build audit screen**
  - Add a paginated, readable security-event view for owner/admin.
  - Evidence: role access, empty state and populated state pass browser tests.

- [x] **T606 — Verify responsive and error states**
  - Test desktop and narrow mobile widths, loading, validation, denied, expired and retry states.
  - Evidence: Playwright journey and visual inspection complete without overflow or blocked controls.

## 7. Hardening and delivery evidence

- [x] **T701 — Add structured security logging**
  - Log correlation ID, event category and stable code through an allowlist.
  - Evidence: automated redaction tests reject passwords, cookies and raw tokens in captured logs.

- [x] **T702 — Run dependency, license and secret checks**
  - Resolve high/critical findings or document a reviewed exception.
  - Evidence: saved current reports contain no unresolved unaccepted blocker.

- [x] **T703 — Execute the identity threat-model checklist**
  - Cover session fixation, CSRF, replay, enumeration, privilege escalation and tenant escape.
  - Evidence: every threat maps to a control and passing test or an explicit approved residual risk.

- [x] **T704 — Verify production build and safe startup**
  - Build and start with production-mode configuration against a clean migrated database.
  - Evidence: health check passes, test seeds remain unreachable and public registration stays disabled.

- [x] **T705 — Review migrations and recovery notes**
  - Record forward-recovery guidance and confirm no automatic destructive production rollback.
  - Evidence: migration review checklist is signed off before release candidate status.

- [x] **T706 — Run the complete acceptance gate**
  - Execute lint, strict typecheck, unit, PostgreSQL integration, API, build and Playwright suites from a clean state.
  - Evidence: all commands pass with exact results recorded.

- [x] **T707 — Produce honest module acceptance record**
  - Map every specification success criterion to concrete evidence and list all deferred capabilities.
  - Evidence: no unsupported claim remains; module status changes to accepted only after review.

## Final acceptance checklist

- [ ] First-owner registration is atomic and gated.
- [ ] Opaque sessions rotate and revoke without plaintext server storage.
- [ ] Every role-matrix path is proven through the API.
- [ ] Concurrent operations cannot eliminate the last active owner.
- [ ] Invitation acceptance is expiring, single-use and retry-safe.
- [ ] Cross-tenant access fails without existence disclosure.
- [ ] Security mutations and audit events commit or roll back together.
- [ ] Static, domain, PostgreSQL, API, build and browser gates pass.
- [ ] Test-only controls fail closed in production configuration.
- [ ] Deferred providers and compliance capabilities are not claimed.

## Review gate

After approval, change this document to `Status: approved` and begin with `T001`. New scope or changed security semantics require returning to the relevant specification or plan review rather than silently expanding implementation.
