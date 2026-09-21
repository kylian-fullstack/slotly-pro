import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { BookingStore } from "../../../packages/db/src/booking/booking-store";

const { Pool } = pg;
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL is required for integration tests.");
const pool = new Pool({ connectionString, max: 8 });

async function tenant(suffix: string) {
  const organizationId = randomUUID(); const userId = randomUUID(); const membershipId = randomUUID();
  await pool.query("INSERT INTO users (id, email, display_name, password_hash, updated_at) VALUES ($1, $2, 'Owner', 'test-hash', CURRENT_TIMESTAMP)", [userId, `booking-${suffix}@example.test`]);
  await pool.query("INSERT INTO organizations (id, slug, display_name, updated_at) VALUES ($1, $2, 'Booking Studio', CURRENT_TIMESTAMP)", [organizationId, `booking-${suffix}`]);
  await pool.query("INSERT INTO memberships (id, organization_id, user_id, role, updated_at) VALUES ($1, $2, $3, 'OWNER', CURRENT_TIMESTAMP)", [membershipId, organizationId, userId]);
  return { organizationId, userId, membershipId, role: "OWNER" as const, slug: `booking-${suffix}` };
}

describe("PostgreSQL booking core", () => {
  beforeAll(async () => {
    const guard = await pool.query("SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()");
    expect(guard.rows[0]?.marker).toBe("slotly_test_only");
  });
  afterAll(async () => pool.end());

  it("publishes availability, prevents a concurrent double booking and supports secure cancellation", async () => {
    const suffix = randomUUID().slice(0, 8); const actor = await tenant(suffix); const store = new BookingStore(pool);
    const serviceId = randomUUID();
    await store.createService(actor, { id: serviceId, name: "Konzultace", description: "", durationMinutes: 60,
      priceCents: 149000, providerMembershipIds: [actor.membershipId] });
    await store.replaceAvailability(actor, actor.membershipId, [{ weekday: 1, startMinute: 9 * 60, endMinute: 12 * 60 }]);
    const slots = await store.getAvailableSlots(actor.slug, serviceId, actor.membershipId, "2027-01-04", new Date("2027-01-03T00:00:00Z"));
    expect(slots).toHaveLength(9);
    const startsAt = slots[0]?.startsAt;
    expect(startsAt).toBeDefined();
    const booking = (customerEmail: string, confirmationCode: string, cancellationToken: string) => store.createPublicBooking({
      id: randomUUID(), organizationSlug: actor.slug, serviceId, providerMembershipId: actor.membershipId,
      startsAt: startsAt!, customerName: "Test Customer", customerEmail, notes: "", confirmationCode,
      cancellationDigest: createHash("sha256").update(cancellationToken).digest("hex"), now: new Date("2027-01-03T00:00:00Z")
    });
    const outcomes = await Promise.allSettled([
      booking(`first-${suffix}@example.test`, `FIRST${suffix}`, `cancel-first-${suffix}`),
      booking(`second-${suffix}@example.test`, `SECOND${suffix}`, `cancel-second-${suffix}`)
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    const winner = outcomes.find((result): result is PromiseFulfilledResult<Record<string, unknown>> => result.status === "fulfilled");
    expect(winner).toBeDefined();
    const confirmationCode = String(winner!.value.confirmationCode);
    const cancellationToken = confirmationCode.startsWith("FIRST") ? `cancel-first-${suffix}` : `cancel-second-${suffix}`;
    await expect(store.cancelPublicBooking(actor.slug, confirmationCode,
      createHash("sha256").update(cancellationToken).digest("hex"), new Date("2027-01-03T00:00:00Z"))).resolves.toMatchObject({ status: "CANCELLED" });
    await expect(store.cancelPublicBooking(actor.slug, confirmationCode,
      createHash("sha256").update("wrong-token").digest("hex"), new Date("2027-01-03T00:00:00Z"))).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("rejects assigning a service to a member from another tenant", async () => {
    const first = await tenant(randomUUID().slice(0, 8)); const second = await tenant(randomUUID().slice(0, 8));
    await expect(new BookingStore(pool).createService(first, { id: randomUUID(), name: "Cizí služba", description: "",
      durationMinutes: 30, priceCents: 0, providerMembershipIds: [second.membershipId] })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
