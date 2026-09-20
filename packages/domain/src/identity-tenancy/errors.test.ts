import { describe, expect, it } from "vitest";
import { domainErrorCodes, type DomainErrorCode } from "./errors";

const categories: Readonly<Record<DomainErrorCode, "client" | "server">> = {
  AUTHENTICATION_REQUIRED: "client", INVALID_CREDENTIALS: "client", SESSION_EXPIRED: "client",
  CSRF_REJECTED: "client", FORBIDDEN: "client", RESOURCE_NOT_FOUND: "client",
  VALIDATION_FAILED: "client", REGISTRATION_DISABLED: "client", INVITATION_INVALID: "client",
  INVITATION_EXPIRED: "client", INVITATION_EMAIL_MISMATCH: "client", LAST_OWNER_REQUIRED: "client",
  IDEMPOTENCY_KEY_REQUIRED: "client", IDEMPOTENCY_KEY_REUSED: "client", RATE_LIMITED: "client",
  CONFLICT: "client", INTERNAL_ERROR: "server"
};

describe("domain error contract", () => {
  it("forces every stable error code into a response category", () => {
    expect(Object.keys(categories).sort()).toEqual([...domainErrorCodes].sort());
  });
});
