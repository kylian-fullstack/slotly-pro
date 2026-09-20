import { describe, expect, it } from "vitest";
import { invitationCreateSchema, loginRequestSchema, membershipPatchSchema, registrationRequestSchema } from "./identity-tenancy";

describe("identity HTTP contracts", () => {
  it("normalizes a valid registration request", () => {
    const result = registrationRequestSchema.parse({
      email: " Owner@Example.COM ", password: "correct horse battery staple", displayName: "Majitel",
      organizationName: "Studio Praha", organizationSlug: "studio-praha", timezone: "Europe/Prague"
    });
    expect(result.email).toBe("owner@example.com");
  });

  it("rejects client-supplied tenant and role escalation fields", () => {
    expect(() => loginRequestSchema.parse({ email: "a@example.test", password: "secret", organizationId: crypto.randomUUID() })).toThrow();
    expect(() => invitationCreateSchema.parse({ email: "a@example.test", role: "OWNER", expiresInHours: 48 })).toThrow();
    expect(() => membershipPatchSchema.parse({ role: "OWNER" })).toThrow();
  });

  it("rejects empty mutation payloads", () => {
    expect(() => membershipPatchSchema.parse({})).toThrow(/At least one field/);
  });
});
