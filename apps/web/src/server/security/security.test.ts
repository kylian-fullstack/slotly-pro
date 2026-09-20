import { describe, expect, it } from "vitest";
import { buildExpiredSessionCookie, buildSessionCookie } from "./cookie";
import { createCsrfToken, isTrustedMutationOrigin, verifyCsrfToken } from "./csrf";
import { createPasswordHasher } from "./password";
import { secretGenerator } from "./secrets";

const testPasswordParameters = { memoryCost: 8_192, timeCost: 1, parallelism: 1, hashLength: 16 };

describe("password security", () => {
  it("hashes with Argon2id and verifies only the correct password", async () => {
    const hasher = createPasswordHasher(testPasswordParameters);
    const hash = await hasher.hash("correct horse battery staple");
    expect(hash).toContain("$argon2id$");
    await expect(hasher.verify(hash, "correct horse battery staple")).resolves.toBe(true);
    await expect(hasher.verify(hash, "incorrect")).resolves.toBe(false);
    await expect(hasher.verify("malformed", "incorrect")).resolves.toBe(false);
  });

  it("detects hashes that require stronger parameters", async () => {
    const weak = createPasswordHasher(testPasswordParameters);
    const hash = await weak.hash("upgrade me safely");
    expect(createPasswordHasher().needsUpgrade(hash)).toBe(true);
  });
});

describe("session and request secrets", () => {
  it("generates an opaque secret and stores a one-way digest", () => {
    const token = secretGenerator.generate(32);
    const digest = secretGenerator.digest(token);
    expect(token).not.toBe(digest);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("builds secure production cookies and expiring logout cookies", () => {
    expect(buildSessionCookie({ token: "secret", maxAgeSeconds: 3600, production: true })).toBe(
      "slotly_session=secret; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600; Secure"
    );
    expect(buildExpiredSessionCookie(false)).toContain("Max-Age=0");
  });

  it("binds CSRF tokens to a session and secret", () => {
    const token = createCsrfToken("session-a", "a-server-secret-with-at-least-32-chars");
    expect(verifyCsrfToken(token, "session-a", "a-server-secret-with-at-least-32-chars")).toBe(true);
    expect(verifyCsrfToken(token, "session-b", "a-server-secret-with-at-least-32-chars")).toBe(false);
  });

  it("accepts only the configured origin", () => {
    expect(isTrustedMutationOrigin("https://slotly.example", "https://slotly.example/path")).toBe(true);
    expect(isTrustedMutationOrigin("https://evil.example", "https://slotly.example")).toBe(false);
    expect(isTrustedMutationOrigin(null, "https://slotly.example")).toBe(false);
  });
});
