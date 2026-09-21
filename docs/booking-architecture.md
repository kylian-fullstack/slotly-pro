# Booking architecture and invariants

## Scope

The booking module covers service configuration, provider assignment, weekly working hours, public slot discovery, booking creation, operator status changes and customer cancellation. It does not claim payments or outbound email/SMS delivery.

## Trust boundaries

- Public callers provide an organization slug, service, provider, start time and customer contact fields. They never provide a tenant identifier or booking end time.
- The server derives the organization from the public slug and verifies the service/provider assignment in that organization.
- Authenticated operator routes derive the tenant exclusively from the opaque server-side session.
- Mutation routes for operators require a trusted origin and CSRF token. Public booking and cancellation endpoints use bounded schemas, persistent rate limits and unguessable tokens.

## Scheduling invariants

- A service duration is between 5 and 720 minutes.
- A slot must fit completely inside an active weekly availability rule.
- Public bookings require at least 60 minutes of lead time.
- The selected provider must be active and assigned to the selected active service.
- A PostgreSQL GiST exclusion constraint prevents overlapping `CONFIRMED` bookings for the same tenant and provider. Application checks improve the error message; the database remains authoritative under concurrency.
- Cancelling a booking releases the interval because the exclusion constraint applies only to confirmed bookings.

## Time zones

Organizations store an IANA time zone. Weekly hours are local wall-clock minutes. Slot generation converts local times to UTC for persistence and returns ISO timestamps to clients. Interfaces format timestamps back into the organization time zone.

## Audit events

The append-only audit records include `service.created`, `availability.replaced`, `booking.created`, `booking.status_changed` and `booking.cancelled_by_customer`. Customer email, phone and cancellation tokens are not copied into audit metadata.

## Failure and rollback

The booking migration is additive. The application can be rolled back while the new tables remain unused. Removing the schema requires an explicit maintenance window and verified backup; production startup never drops booking data automatically.
