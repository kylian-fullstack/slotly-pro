import { describe, expect, it } from "vitest";
import { parseServerEnvironment } from "./env";

const validEnvironment = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://slotly:secret@localhost:45432/slotly_dev",
  TEST_DATABASE_URL: "postgresql://slotly:secret@localhost:45432/slotly_test",
  TEST_DATABASE_MARKER: "slotly_test_only",
  SESSION_SECRET: "a-random-development-secret-with-32-chars",
  PUBLIC_REGISTRATION_ENABLED: "false",
  TEST_SEED_ENABLED: "false",
  RATE_LIMIT_BACKEND: "memory",
  APP_ORIGIN: "http://localhost:3000"
} satisfies Record<string, string>;

describe("parseServerEnvironment", () => {
  it("parses an explicit development environment", () => {
    const result = parseServerEnvironment(validEnvironment);

    expect(result.PUBLIC_REGISTRATION_ENABLED).toBe(false);
    expect(result.TEST_SEED_ENABLED).toBe(false);
  });

  it("rejects missing secrets", () => {
    expect(() =>
      parseServerEnvironment({ ...validEnvironment, SESSION_SECRET: undefined })
    ).toThrow();
  });

  it("rejects non-PostgreSQL database URLs", () => {
    expect(() =>
      parseServerEnvironment({ ...validEnvironment, DATABASE_URL: "file:local.db" })
    ).toThrow();
  });

  it("fails closed when production test seeds are enabled", () => {
    expect(() =>
      parseServerEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
        TEST_SEED_ENABLED: "true",
        RATE_LIMIT_BACKEND: "postgres"
      })
    ).toThrow(/Test seeds must be disabled/);
  });

  it("rejects an in-memory production rate limiter", () => {
    expect(() =>
      parseServerEnvironment({ ...validEnvironment, NODE_ENV: "production" })
    ).toThrow(/shared rate-limit backend/);
  });
});
