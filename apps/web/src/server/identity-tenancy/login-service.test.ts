import { describe, expect, it, vi } from "vitest";
import { verifyLogin } from "./login-service";

const credential = { userId: "user", passwordHash: "real-hash", membershipId: "member", organizationId: "org" };

describe("verifyLogin", () => {
  it("uses the same public failure for an unknown email and a wrong password", async () => {
    const verify = vi.fn(async () => false);
    const unknown = verifyLogin("unknown@example.test", "wrong", {
      credentials: { findForLogin: async () => null },
      passwords: { hash: vi.fn(), verify, needsUpgrade: vi.fn() }, dummyPasswordHash: "dummy-hash"
    });
    const incorrect = verifyLogin("known@example.test", "wrong", {
      credentials: { findForLogin: async () => credential },
      passwords: { hash: vi.fn(), verify, needsUpgrade: vi.fn() }, dummyPasswordHash: "dummy-hash"
    });
    await expect(unknown).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", message: "E-mail nebo heslo není správné." });
    await expect(incorrect).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", message: "E-mail nebo heslo není správné." });
    expect(verify).toHaveBeenCalledWith("dummy-hash", "wrong");
    expect(verify).toHaveBeenCalledWith("real-hash", "wrong");
  });

  it("returns the credential only after password verification", async () => {
    await expect(verifyLogin("known@example.test", "correct", {
      credentials: { findForLogin: async () => credential },
      passwords: { hash: vi.fn(), verify: async () => true, needsUpgrade: vi.fn() }, dummyPasswordHash: "dummy-hash"
    })).resolves.toEqual(credential);
  });
});
