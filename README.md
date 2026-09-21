# Slotly Pro

Slotly Pro is a multi-tenant booking system for service businesses. It combines a public customer booking journey with a Czech operator workspace, collision-safe PostgreSQL scheduling, identity, roles and an immutable audit trail.

The interface is in Czech. The implementation and evidence are intended to be readable by an international engineering team.

## What works today

- feature-gated first-owner registration in one PostgreSQL transaction;
- Argon2id credentials and opaque, revocable server-side sessions;
- `OWNER`, `ADMIN` and `STAFF` authorization policies;
- expiring, single-use invitations with hashed tokens and retry-safe acceptance;
- tenant context derived only from the authenticated session;
- last-active-owner protection under concurrent mutations;
- append-only audit events for security-sensitive changes;
- PostgreSQL-backed rate limits for login, registration and invitation acceptance;
- Czech responsive operator UI for login, onboarding, organization, team, invitations and audit;
- configurable services, prices, durations and assigned team members;
- recurring weekly working hours for each provider;
- timezone-aware public availability and booking pages at `/rezervace/{firma}`;
- database-enforced prevention of concurrent double bookings;
- an operator calendar with completion, no-show and cancellation workflows;
- confirmation codes and secret self-service cancellation links;
- unit, PostgreSQL integration, API abuse and desktop/mobile browser tests.

Live email/SMS delivery, payments, MFA and external identity providers are deliberately not claimed in this release. Confirmation is displayed immediately in the browser; no message is sent unless a future notification provider is explicitly configured.

## Architecture

```text
Browser / Czech UI
        |
Versioned /api/v1 routes
        |
Authentication -> tenant derivation -> CSRF -> authorization
        |
Booking APIs and transaction boundaries
        |
Typed domain policies       PostgreSQL adapters
        |                           |
        +---------- PostgreSQL 18 --+
                    exclusion constraints,
                    append-only audit
```

The monorepo keeps framework-free rules in `packages/domain`, request contracts in `packages/contracts`, database adapters and migrations in `packages/db`, and the Next.js boundary in `apps/web`.

## Booking workflow

1. An owner or administrator creates a service and assigns an active team member.
2. They publish weekly working hours for that provider.
3. A customer opens `/rezervace/{organization-slug}`, chooses a service, provider, day and a generated free slot.
4. PostgreSQL accepts only one confirmed booking for an overlapping provider interval, including concurrent requests.
5. The customer receives a confirmation code and secret cancellation link; the team sees the booking in its workspace immediately.
6. Staff can complete, cancel or mark the booking as a no-show. Every status change is tenant-scoped and audited.

## Run locally

Requirements: Node.js 24, pnpm 11 and Docker Desktop.

```bash
docker compose up -d
pnpm install --frozen-lockfile
cp .env.example apps/web/.env.local
pnpm db:migrate
pnpm dev
```

Replace the example session secret before using the application. Public registration is disabled by default; enable it only for a controlled onboarding window.

## Evidence gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
pnpm audit --audit-level moderate
```

The PostgreSQL integration suite requires `TEST_DATABASE_URL` and refuses destructive test setup unless the target database carries the `slotly_test_only` database marker.

Design and security evidence:

- [Capability map](CAPABILITY_MAP.md)
- [Approved identity and tenancy specification](SPEC-identity-tenancy.md)
- [Implementation plan](tasks/plan.md)
- [Executable task ledger](tasks/todo.md)
- [Threat model](docs/identity-threat-model.md)
- [Dependency baseline](docs/dependency-baseline.md)
- [Migration recovery](docs/migration-recovery.md)
- [Current security audit](docs/security-audit-2026-09-20.md)
- [Identity module acceptance record](docs/identity-module-acceptance.md)
- [Booking architecture and invariants](docs/booking-architecture.md)

## Security reporting

Do not include passwords, cookies, session values or invitation links in an issue. This repository currently has no live security-contact mailbox, so private vulnerability intake is deferred until a real maintainer address is configured.

## License

No open-source license has been granted yet. The source is visible for portfolio review; reuse requires the author's permission until a license file is added.
