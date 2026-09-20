import { describe, expect, it } from "vitest";
import { createMembership, type Membership } from "./entities";
import { parseMembershipId, parseOrganizationId, parseUserId, parseUtcTimestamp } from "./value-objects";

const validMembership: Membership = {
  id: parseMembershipId("33333333-3333-4333-8333-333333333333"),
  organizationId: parseOrganizationId("11111111-1111-4111-8111-111111111111"),
  userId: parseUserId("44444444-4444-4444-8444-444444444444"),
  role: "STAFF",
  status: "ACTIVE",
  createdAt: parseUtcTimestamp("2026-09-20T00:00:00.000Z")
};

describe("createMembership", () => {
  it("returns an immutable valid membership", () => {
    expect(Object.isFrozen(createMembership(validMembership))).toBe(true);
  });

  it("rejects runtime role values outside the contract", () => {
    expect(() =>
      createMembership({ ...validMembership, role: "SUPER_ADMIN" } as unknown as Membership)
    ).toThrow(/role/);
  });

  it("rejects runtime status values outside the contract", () => {
    expect(() =>
      createMembership({ ...validMembership, status: "DELETED" } as unknown as Membership)
    ).toThrow(/status/);
  });
});
