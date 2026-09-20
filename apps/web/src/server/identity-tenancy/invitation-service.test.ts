import { describe, expect, it, vi } from "vitest";
import type { Membership, MembershipRole } from "@slotly/domain";
import { parseMembershipId, parseOrganizationId, parseUserId, parseUtcTimestamp } from "@slotly/domain";
import { createInvitation } from "./invitation-service";

function actor(role: MembershipRole): Membership {
  return {
    id: parseMembershipId("33333333-3333-4333-8333-333333333333"),
    organizationId: parseOrganizationId("11111111-1111-4111-8111-111111111111"),
    userId: parseUserId("44444444-4444-4444-8444-444444444444"), role, status: "ACTIVE",
    createdAt: parseUtcTimestamp("2026-09-20T00:00:00.000Z")
  };
}

const secrets = { generate: () => "raw-secret", digest: (value: string) => `digest-of-${value}` };

describe("createInvitation", () => {
  it("allows an owner to invite an admin while persisting only a digest", async () => {
    const persistence = { create: vi.fn(async () => undefined) };
    await expect(createInvitation(actor("OWNER"), { email: "admin@example.test", role: "ADMIN", expiresInHours: 48 }, {
      persistence, secrets, createId: () => "invitation-id", now: () => new Date("2026-09-20T00:00:00.000Z")
    })).resolves.toEqual({ invitationId: "invitation-id", token: "raw-secret" });
    expect(persistence.create).toHaveBeenCalledWith(expect.objectContaining({ tokenDigest: "digest-of-raw-secret" }));
    expect(JSON.stringify(persistence.create.mock.calls)).not.toContain('"token":"raw-secret"');
  });

  it("allows an admin to invite staff but not another admin", async () => {
    const persistence = { create: vi.fn(async () => undefined) };
    await expect(createInvitation(actor("ADMIN"), { email: "staff@example.test", role: "STAFF", expiresInHours: 24 }, { persistence, secrets })).resolves.toBeDefined();
    await expect(createInvitation(actor("ADMIN"), { email: "admin@example.test", role: "ADMIN", expiresInHours: 24 }, { persistence, secrets })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies staff invitation creation", async () => {
    await expect(createInvitation(actor("STAFF"), { email: "staff@example.test", role: "STAFF", expiresInHours: 24 }, {
      persistence: { create: vi.fn() }, secrets
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
