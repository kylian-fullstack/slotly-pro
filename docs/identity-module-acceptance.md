# Identity and tenancy acceptance record

Date: 2026-09-20  
Status: accepted module; booking-domain capabilities remain deferred

## Specification criteria

| Criterion | Evidence | Result |
| --- | --- | --- |
| Gated atomic first-owner registration | registration service/unit tests, PostgreSQL rollback test, production API journey | Pass |
| Argon2id credentials and opaque sessions | password/security unit tests and session persistence/rotation integration test | Pass |
| Session-derived tenant context | strict request schemas, typed tenant repository test and organization API journey | Pass |
| Complete owner/admin/staff policy behavior | domain policy matrix plus owner/admin/staff API journey | Pass |
| Last active owner survives concurrent changes | two-connection PostgreSQL test and HTTP rejection | Pass |
| Invitations are expiring, single-use and retry-safe | invitation unit/integration tests, idempotent API replay and browser acceptance journey | Pass |
| Security mutations have append-only audit evidence | PostgreSQL immutability test, transactional writers and owner audit screen | Pass |
| Browser mutation protection | origin and session-bound CSRF tests plus rejected API mutation | Pass |
| Abuse resistance and safe errors | PostgreSQL rate limiter, enumeration tests, redacted structured logs and browser error tests | Pass |
| Desktop and mobile operator journey | six Playwright checks across desktop Chromium and Pixel 7 dimensions | Pass |
| Production-safe startup | optimized build, database health `200`, disabled registration `403`, test seeds disabled | Pass |

## Explicitly deferred

- booking calendar, availability rules, services, staff schedules and customer bookings;
- outbound invitation e-mail delivery;
- password reset, MFA and external identity providers;
- billing, payments and compliance certification;
- deployment to a public host and remote GitHub Actions history.

The accepted claim is therefore narrow: this repository contains a tested identity and multi-tenant security foundation for Slotly Pro. It is not yet a complete booking SaaS and the README does not present it as one.
