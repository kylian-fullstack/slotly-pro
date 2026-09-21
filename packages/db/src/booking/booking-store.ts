import { DomainError, generateAvailableSlots } from "@slotly/domain";
import type { Pool, PoolClient } from "pg";
import type { TenantActor } from "../identity-tenancy/organization-store";

interface ServiceInput {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly durationMinutes: number;
  readonly priceCents: number;
  readonly providerMembershipIds: readonly string[];
}

interface PublicBookingInput {
  readonly id: string;
  readonly organizationSlug: string;
  readonly serviceId: string;
  readonly providerMembershipId: string;
  readonly startsAt: Date;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly customerPhone?: string;
  readonly notes: string;
  readonly confirmationCode: string;
  readonly cancellationDigest: string;
  readonly now: Date;
}

async function rollback(client: PoolClient): Promise<void> {
  try { await client.query("ROLLBACK"); } catch { /* preserve the original failure */ }
}

function localDateInTimezone(value: Date, timezone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export class BookingStore {
  constructor(private readonly pool: Pool) {}

  async createService(tenant: TenantActor, input: ServiceInput) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const providers = await client.query<{ id: string }>(
        `SELECT id FROM memberships WHERE organization_id = $1 AND id = ANY($2::uuid[]) AND status = 'ACTIVE' FOR SHARE`,
        [tenant.organizationId, input.providerMembershipIds]
      );
      if (providers.rowCount !== new Set(input.providerMembershipIds).size) {
        throw new DomainError("VALIDATION_FAILED", "Vybraný pracovník není aktivním členem firmy.");
      }
      const service = await client.query(
        `INSERT INTO services (id, organization_id, name, description, duration_minutes, price_cents, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
         RETURNING id, name, description, duration_minutes AS "durationMinutes", price_cents AS "priceCents", active`,
        [input.id, tenant.organizationId, input.name, input.description, input.durationMinutes, input.priceCents]
      );
      for (const membershipId of new Set(input.providerMembershipIds)) {
        await client.query(
          `INSERT INTO service_providers (organization_id, service_id, membership_id) VALUES ($1, $2, $3)`,
          [tenant.organizationId, input.id, membershipId]
        );
      }
      await client.query(
        `INSERT INTO audit_events (id, organization_id, actor_user_id, action, target_type, target_id, metadata)
         VALUES (gen_random_uuid(), $1, $2, 'service.created', 'service', $3, $4::jsonb)`,
        [tenant.organizationId, tenant.userId, input.id, JSON.stringify({ providers: input.providerMembershipIds.length })]
      );
      await client.query("COMMIT");
      return service.rows[0];
    } catch (error) { await rollback(client); throw error; }
    finally { client.release(); }
  }

  async replaceAvailability(tenant: TenantActor, membershipId: string, rules: readonly { weekday: number; startMinute: number; endMinute: number }[]) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const membership = await client.query(
        `SELECT id FROM memberships WHERE id = $1 AND organization_id = $2 AND status = 'ACTIVE' FOR UPDATE`,
        [membershipId, tenant.organizationId]
      );
      if (!membership.rowCount) throw new DomainError("RESOURCE_NOT_FOUND", "Pracovník nebyl nalezen.");
      await client.query(`DELETE FROM availability_rules WHERE organization_id = $1 AND membership_id = $2`, [tenant.organizationId, membershipId]);
      for (const rule of rules) {
        await client.query(
          `INSERT INTO availability_rules (id, organization_id, membership_id, weekday, start_minute, end_minute, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
          [tenant.organizationId, membershipId, rule.weekday, rule.startMinute, rule.endMinute]
        );
      }
      await client.query(
        `INSERT INTO audit_events (id, organization_id, actor_user_id, action, target_type, target_id, metadata)
         VALUES (gen_random_uuid(), $1, $2, 'availability.replaced', 'membership', $3, $4::jsonb)`,
        [tenant.organizationId, tenant.userId, membershipId, JSON.stringify({ rules: rules.length })]
      );
      await client.query("COMMIT");
      return { membershipId, rules };
    } catch (error) { await rollback(client); throw error; }
    finally { client.release(); }
  }

  async listAdminData(tenant: TenantActor, from: Date, to: Date) {
    const [services, availability, bookings] = await Promise.all([
      this.pool.query(
        `SELECT s.id, s.name, s.description, s.duration_minutes AS "durationMinutes", s.price_cents AS "priceCents", s.active,
                COALESCE(json_agg(sp.membership_id ORDER BY sp.membership_id) FILTER (WHERE sp.active), '[]') AS "providerMembershipIds"
           FROM services s LEFT JOIN service_providers sp ON sp.service_id = s.id AND sp.organization_id = s.organization_id
          WHERE s.organization_id = $1 GROUP BY s.id ORDER BY s.active DESC, s.name`, [tenant.organizationId]
      ),
      this.pool.query(
        `SELECT id, membership_id AS "membershipId", weekday, start_minute AS "startMinute", end_minute AS "endMinute"
           FROM availability_rules WHERE organization_id = $1 AND active ORDER BY membership_id, weekday, start_minute`, [tenant.organizationId]
      ),
      this.pool.query(
        `SELECT b.id, b.starts_at AS "startsAt", b.ends_at AS "endsAt", b.status, b.customer_name AS "customerName",
                b.customer_email AS "customerEmail", b.customer_phone AS "customerPhone", b.notes,
                b.confirmation_code AS "confirmationCode", s.name AS "serviceName", u.display_name AS "providerName"
           FROM bookings b JOIN services s ON s.id = b.service_id
           JOIN memberships m ON m.id = b.provider_membership_id JOIN users u ON u.id = m.user_id
          WHERE b.organization_id = $1 AND b.starts_at >= $2 AND b.starts_at < $3 ORDER BY b.starts_at`,
        [tenant.organizationId, from, to]
      )
    ]);
    return { services: services.rows, availability: availability.rows, bookings: bookings.rows };
  }

  async getPublicCatalog(organizationSlug: string) {
    const organization = await this.pool.query<{ id: string; slug: string; displayName: string; timezone: string }>(
      `SELECT id, slug, display_name AS "displayName", default_timezone AS timezone
         FROM organizations WHERE slug = $1 AND status = 'ACTIVE'`, [organizationSlug]
    );
    const current = organization.rows[0];
    if (!current) throw new DomainError("RESOURCE_NOT_FOUND", "Rezervační stránka nebyla nalezena.");
    const services = await this.pool.query(
      `SELECT s.id, s.name, s.description, s.duration_minutes AS "durationMinutes", s.price_cents AS "priceCents",
              COALESCE(json_agg(json_build_object('membershipId', m.id, 'displayName', u.display_name) ORDER BY u.display_name)
                FILTER (WHERE sp.active AND m.status = 'ACTIVE'), '[]') AS providers
         FROM services s
         LEFT JOIN service_providers sp ON sp.service_id = s.id AND sp.organization_id = s.organization_id
         LEFT JOIN memberships m ON m.id = sp.membership_id AND m.organization_id = sp.organization_id
         LEFT JOIN users u ON u.id = m.user_id
        WHERE s.organization_id = $1 AND s.active
        GROUP BY s.id ORDER BY s.name`, [current.id]
    );
    return { organization: current, services: services.rows };
  }

  async getAvailableSlots(organizationSlug: string, serviceId: string, providerMembershipId: string, date: string, now: Date) {
    const context = await this.pool.query<{ organizationId: string; timezone: string; durationMinutes: number }>(
      `SELECT o.id AS "organizationId", o.default_timezone AS timezone, s.duration_minutes AS "durationMinutes"
         FROM organizations o JOIN services s ON s.organization_id = o.id
         JOIN service_providers sp ON sp.service_id = s.id AND sp.organization_id = o.id
         JOIN memberships m ON m.id = sp.membership_id AND m.organization_id = o.id
        WHERE o.slug = $1 AND o.status = 'ACTIVE' AND s.id = $2 AND s.active
          AND sp.membership_id = $3 AND sp.active AND m.status = 'ACTIVE'`,
      [organizationSlug, serviceId, providerMembershipId]
    );
    const row = context.rows[0];
    if (!row) throw new DomainError("RESOURCE_NOT_FOUND", "Služba nebo pracovník nebyli nalezeni.");
    const [rules, busy] = await Promise.all([
      this.pool.query<{ weekday: number; startMinute: number; endMinute: number }>(
        `SELECT weekday, start_minute AS "startMinute", end_minute AS "endMinute" FROM availability_rules
          WHERE organization_id = $1 AND membership_id = $2 AND active`, [row.organizationId, providerMembershipId]
      ),
      this.pool.query<{ startsAt: Date; endsAt: Date }>(
        `SELECT starts_at AS "startsAt", ends_at AS "endsAt" FROM bookings
          WHERE organization_id = $1 AND provider_membership_id = $2 AND status = 'CONFIRMED'
            AND starts_at < ($3::date + interval '2 days') AND ends_at > ($3::date - interval '1 day')`,
        [row.organizationId, providerMembershipId, date]
      )
    ]);
    return generateAvailableSlots({ date, timezone: row.timezone, durationMinutes: row.durationMinutes,
      rules: rules.rows, busy: busy.rows, now, leadTimeMinutes: 60, stepMinutes: 15 });
  }

  async createPublicBooking(input: PublicBookingInput) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const service = await client.query<{ organizationId: string; durationMinutes: number; timezone: string }>(
        `SELECT o.id AS "organizationId", o.default_timezone AS timezone, s.duration_minutes AS "durationMinutes"
           FROM organizations o JOIN services s ON s.organization_id = o.id
           JOIN service_providers sp ON sp.service_id = s.id AND sp.organization_id = o.id
           JOIN memberships m ON m.id = sp.membership_id AND m.organization_id = o.id
          WHERE o.slug = $1 AND o.status = 'ACTIVE' AND s.id = $2 AND s.active
            AND sp.membership_id = $3 AND sp.active AND m.status = 'ACTIVE' FOR SHARE`,
        [input.organizationSlug, input.serviceId, input.providerMembershipId]
      );
      const context = service.rows[0];
      if (!context) throw new DomainError("RESOURCE_NOT_FOUND", "Služba nebo pracovník nebyli nalezeni.");
      if (input.startsAt.getTime() < input.now.getTime() + 60 * 60_000) {
        throw new DomainError("VALIDATION_FAILED", "Termín musí být rezervován alespoň hodinu předem.");
      }
      const localDate = localDateInTimezone(input.startsAt, context.timezone);
      const [rules, busy] = await Promise.all([
        client.query<{ weekday: number; startMinute: number; endMinute: number }>(
          `SELECT weekday, start_minute AS "startMinute", end_minute AS "endMinute" FROM availability_rules
            WHERE organization_id = $1 AND membership_id = $2 AND active`, [context.organizationId, input.providerMembershipId]
        ),
        client.query<{ startsAt: Date; endsAt: Date }>(
          `SELECT starts_at AS "startsAt", ends_at AS "endsAt" FROM bookings
            WHERE organization_id = $1 AND provider_membership_id = $2 AND status = 'CONFIRMED'
              AND starts_at < $3::timestamptz + interval '1 day' AND ends_at > $3::timestamptz - interval '1 day'`,
          [context.organizationId, input.providerMembershipId, input.startsAt]
        )
      ]);
      const allowed = generateAvailableSlots({ date: localDate, timezone: context.timezone,
        durationMinutes: context.durationMinutes, rules: rules.rows, busy: busy.rows, now: input.now,
        leadTimeMinutes: 60, stepMinutes: 15 }).some((slot) => slot.startsAt.getTime() === input.startsAt.getTime());
      if (!allowed) throw new DomainError("CONFLICT", "Vybraný termín už není dostupný.");
      const endsAt = new Date(input.startsAt.getTime() + context.durationMinutes * 60_000);
      const result = await client.query(
        `INSERT INTO bookings (id, organization_id, service_id, provider_membership_id, customer_name, customer_email,
           customer_phone, starts_at, ends_at, confirmation_code, cancellation_digest, notes, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
         RETURNING id, starts_at AS "startsAt", ends_at AS "endsAt", status, confirmation_code AS "confirmationCode"`,
        [input.id, context.organizationId, input.serviceId, input.providerMembershipId, input.customerName,
          input.customerEmail, input.customerPhone ?? null, input.startsAt, endsAt, input.confirmationCode,
          input.cancellationDigest, input.notes]
      );
      await client.query(
        `INSERT INTO audit_events (id, organization_id, action, target_type, target_id, metadata)
         VALUES (gen_random_uuid(), $1, 'booking.created', 'booking', $2, $3::jsonb)`,
        [context.organizationId, input.id, JSON.stringify({ serviceId: input.serviceId, providerMembershipId: input.providerMembershipId })]
      );
      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await rollback(client);
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23P01") {
        throw new DomainError("CONFLICT", "Tento termín právě obsadil jiný zákazník. Vyberte prosím jiný.");
      }
      throw error;
    } finally { client.release(); }
  }

  async updateBookingStatus(tenant: TenantActor, bookingId: string, status: "CANCELLED" | "COMPLETED" | "NO_SHOW") {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE bookings SET status = $1::"BookingStatus", cancelled_at = CASE WHEN $1 = 'CANCELLED' THEN CURRENT_TIMESTAMP ELSE cancelled_at END,
           updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND organization_id = $3 AND status = 'CONFIRMED'
         RETURNING id, status, starts_at AS "startsAt", ends_at AS "endsAt"`,
        [status, bookingId, tenant.organizationId]
      );
      if (!result.rowCount) throw new DomainError("CONFLICT", "Rezervaci už nelze změnit.");
      await client.query(
        `INSERT INTO audit_events (id, organization_id, actor_user_id, action, target_type, target_id, metadata)
         VALUES (gen_random_uuid(), $1, $2, 'booking.status_changed', 'booking', $3, $4::jsonb)`,
        [tenant.organizationId, tenant.userId, bookingId, JSON.stringify({ status })]
      );
      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) { await rollback(client); throw error; }
    finally { client.release(); }
  }
}
