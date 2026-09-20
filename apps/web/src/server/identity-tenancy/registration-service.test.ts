import { describe, expect, it, vi } from "vitest";
import { registerOwner } from "./registration-service";

const passwords = { hash: vi.fn(async () => "hash"), verify: vi.fn(), needsUpgrade: vi.fn() };

describe("registerOwner", () => {
  it("fails closed before hashing or persistence when disabled", async () => {
    const persistence = { registerOwner: vi.fn() };
    await expect(registerOwner({
      email: "owner@example.test", password: "long safe password", displayName: "Owner",
      organizationName: "Studio", organizationSlug: "studio", timezone: "Europe/Prague"
    }, { enabled: false, passwords, persistence })).rejects.toMatchObject({ code: "REGISTRATION_DISABLED" });
    expect(passwords.hash).not.toHaveBeenCalled();
    expect(persistence.registerOwner).not.toHaveBeenCalled();
  });

  it("persists one complete owner registration when enabled", async () => {
    const persistence = { registerOwner: vi.fn(async () => undefined) };
    const ids = ["user", "organization", "membership", "audit"];
    await expect(registerOwner({
      email: "owner@example.test", password: "long safe password", displayName: "Owner",
      organizationName: "Studio", organizationSlug: "studio", timezone: "Europe/Prague"
    }, { enabled: true, passwords, persistence, createId: () => ids.shift() ?? "missing" })).resolves.toEqual({ userId: "user", organizationId: "organization" });
    expect(persistence.registerOwner).toHaveBeenCalledWith(expect.objectContaining({ membershipId: "membership", auditEventId: "audit", passwordHash: "hash" }));
  });
});
