import { describe, expect, it } from "vitest";
import { availabilityReplaceSchema, bookingCreateSchema, serviceCreateSchema } from "./booking";

const id = "4e65545b-80bb-4f4e-91de-dc74cf74ad84";

describe("booking contracts", () => {
  it("accepts a complete service definition", () => {
    expect(serviceCreateSchema.parse({
      name: "Konzultace", durationMinutes: 60, priceCents: 149000, providerMembershipIds: [id]
    })).toMatchObject({ name: "Konzultace", description: "" });
  });

  it("rejects invalid working intervals", () => {
    expect(() => availabilityReplaceSchema.parse({
      membershipId: id, rules: [{ weekday: 1, startMinute: 600, endMinute: 540 }]
    })).toThrow();
  });

  it("normalizes customer email and rejects tenant-controlled fields", () => {
    const input = {
      serviceId: id, providerMembershipId: id, startsAt: "2026-09-21T10:00:00+02:00",
      customerName: "Eva Nováková", customerEmail: " EVA@EXAMPLE.CZ ", organizationId: id
    };
    expect(() => bookingCreateSchema.parse(input)).toThrow();
    delete (input as Partial<typeof input>).organizationId;
    expect(bookingCreateSchema.parse(input).customerEmail).toBe("eva@example.cz");
  });
});
