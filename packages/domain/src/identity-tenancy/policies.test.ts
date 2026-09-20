import { describe, expect, it } from "vitest";
import type { Membership, MembershipRole } from "./entities";
import { authorize, capabilities, type Capability } from "./policies";
import { parseMembershipId, parseOrganizationId, parseUserId, parseUtcTimestamp } from "./value-objects";

const organizationId = parseOrganizationId("11111111-1111-4111-8111-111111111111");
const otherOrganizationId = parseOrganizationId("22222222-2222-4222-8222-222222222222");
const expected: Readonly<Record<Capability, readonly MembershipRole[]>> = {
  READ_ORGANIZATION: ["OWNER", "ADMIN", "STAFF"], UPDATE_ORGANIZATION: ["OWNER", "ADMIN"],
  INVITE_STAFF: ["OWNER", "ADMIN"], MANAGE_STAFF: ["OWNER", "ADMIN"], INVITE_ADMIN: ["OWNER"],
  MANAGE_ADMIN: ["OWNER"], MANAGE_OWNER: ["OWNER"], READ_AUDIT: ["OWNER", "ADMIN"]
};

function membership(role: MembershipRole, active = true): Membership {
  return { id: parseMembershipId("33333333-3333-4333-8333-333333333333"), organizationId, userId: parseUserId("44444444-4444-4444-8444-444444444444"), role, status: active ? "ACTIVE" : "SUSPENDED", createdAt: parseUtcTimestamp("2026-09-20T00:00:00.000Z") };
}

describe("authorization matrix", () => {
  for (const capability of capabilities) {
    for (const role of ["OWNER", "ADMIN", "STAFF"] as const) {
      it(`${role} ${expected[capability].includes(role) ? "may" : "may not"} ${capability}`, () => {
        expect(authorize(membership(role), capability).allowed).toBe(expected[capability].includes(role));
      });
    }
  }
  it("denies inactive members before evaluating role", () => {
    expect(authorize(membership("OWNER", false), "READ_ORGANIZATION")).toEqual({ allowed: false, reason: "INACTIVE_MEMBERSHIP" });
  });
  it("denies cross-tenant targets before evaluating role", () => {
    expect(authorize(membership("OWNER"), "MANAGE_OWNER", { organizationId: otherOrganizationId })).toEqual({ allowed: false, reason: "TENANT_BOUNDARY" });
  });
});
