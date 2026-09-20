# Capability Map: Slotly Pro

Status: product scope approved on 2026-09-20; module specifications may proceed.

## Product thesis

Slotly Pro will be a standalone, multi-tenant appointment platform for service businesses. It must
demonstrate real scheduling correctness rather than a decorative calendar: Europe/Prague time-zone
handling, staff and resource capacity, transactional conflict prevention, idempotent mutations,
rescheduling and cancellation rules, an auditable operator workflow, and safe asynchronous
notifications.

The existing Portfolio Lab `/apps/booking` route remains a small reference demo. It stores only a
UTC slot and customer name, has no account or role model, and explicitly lacks calendar sync,
reminders, browser QA, and dedicated relational domain tables. Slotly Pro therefore becomes the
deep portfolio product; it does not duplicate that demo inside the nine-app repository.

## Verified baseline (2026-09-20)

The current Portfolio Lab source was rechecked before defining this map:

- authored-code lint, TypeScript, 13 domain checks, and the Vinext production build pass;
- after initializing the D1 database used by the generated production config, all 17 HTTP checks
  pass, including the unique-index concurrency case and release-after-cancellation behavior;
- a clean production start before that initialization returns HTTP 503 because the README command
  initializes the root Wrangler state while `npm start` reads the generated config's state under
  `dist/server`;
- the booking implementation exposes six fixed UTC times over 30 days, stores only `slot` and
  `name`, and deletes the reservation on cancellation.

This proves the old demo's narrow behavior and concurrency guard. It does not prove the richer
availability, tenant, lifecycle, permission, notification, or browser behavior required below.

## Assumptions to review

1. The first credible vertical is appointment-based services such as salons, consultants, studios,
   and small clinics—not hotels, restaurant tables, or vehicle-rental inventory.
2. The product is a responsive web application and API; native mobile applications are out of v1.
3. PostgreSQL is the authoritative store. Booking correctness must not rely on an in-process lock.
4. The reference deployment uses Europe/Prague by default but stores instants in UTC and retains the
   location time zone needed for DST-safe rendering and slot generation.
5. Payments, live SMS/e-mail delivery, Google/Microsoft calendar sync, and healthcare records are
   integration boundaries, not simulated production claims in the first milestone.
6. Czech is the first UI language; domain and API identifiers remain English.

## Modules

| Module id | Responsibility | Depends on |
| --- | --- | --- |
| `identity-tenancy` | Accounts, organizations, memberships, OWNER/ADMIN/STAFF roles, session boundaries | — |
| `catalog-resources` | Locations, services, duration and buffers, staff skills, bookable resources and capacity | `identity-tenancy` |
| `availability-engine` | Weekly schedules, breaks, exceptions, holidays, time-zone/DST-safe candidate slot generation | `catalog-resources` |
| `booking-lifecycle` | Temporary holds, booking, confirmation, reschedule, cancellation, idempotency and database conflict prevention | `availability-engine` |
| `customer-experience` | Public service/staff/slot selection, contact capture, confirmation and signed self-service management link | `booking-lifecycle` |
| `operations-console` | Day/week calendar, booking detail, manual booking, overrides, waitlist, staff-scoped permissions and audit log | `booking-lifecycle` |
| `notification-outbox` | Durable outbox, confirmation/reminder/cancellation events, retries, suppression and provider adapters | `booking-lifecycle` |
| `reporting-observability` | Occupancy, cancellations/no-shows, source metrics, health signals and traceable operational events | `operations-console`, `notification-outbox` |

Build order:

`identity-tenancy` → `catalog-resources` → `availability-engine` → `booking-lifecycle` →
(`customer-experience`, `operations-console`, `notification-outbox`) →
`reporting-observability`

## Boundary contracts

- `catalog-resources` provides immutable service duration/buffer snapshots for a booking attempt.
- `availability-engine` returns candidates, never a promise that a slot is still free.
- `booking-lifecycle` is the only module allowed to commit or move a booking; the database is the
  final arbiter under concurrency.
- UI modules never write booking tables directly; all mutations carry tenant context and an
  idempotency key.
- `notification-outbox` consumes committed domain events. Provider failure cannot roll back a valid
  booking or silently mark a notification as delivered.
- `reporting-observability` reads domain facts and audit events; it cannot mutate operational state.

## First vertical proof

A business owner creates a Prague location, two services with different durations/buffers, and two
staff members with different skills and schedules. Two clients racing for the final slot cannot both
book it. The winner can reschedule through a signed link; the released slot becomes available again.
The operator sees the change and complete audit trail. Confirmation/reminder jobs appear in the
outbox, but no real message leaves the system without an explicitly configured provider.

## Explicit non-goals for the first vertical

- Taking real payments or storing card data.
- Sending real SMS/e-mail before a provider, consent policy, and delivery/retry gate are verified.
- Claiming Google or Microsoft calendar synchronization before credentialed end-to-end validation.
- Medical records, diagnosis, treatment notes, or other special-category health data.
- Marketplace discovery, commissions, dynamic pricing, or hotel-style multi-night inventory.
- AI-generated availability decisions; scheduling correctness remains deterministic.

## Review gate

After this map is accepted, each module receives its own `SPEC-<module-id>.md`. The first
implementation slice will cover `identity-tenancy` through a minimal `booking-lifecycle` API with
deterministic unit tests and a real PostgreSQL concurrency integration test before any polished UI.
