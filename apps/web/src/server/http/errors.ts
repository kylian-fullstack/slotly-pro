import { DomainError } from "@slotly/domain";
import { ZodError } from "zod";
import { writeSecurityLog } from "../security/logging";

const statusByCode = {
  AUTHENTICATION_REQUIRED: 401, INVALID_CREDENTIALS: 401, SESSION_EXPIRED: 401,
  CSRF_REJECTED: 403, FORBIDDEN: 403, RESOURCE_NOT_FOUND: 404, VALIDATION_FAILED: 400,
  REGISTRATION_DISABLED: 403, INVITATION_INVALID: 404, INVITATION_EXPIRED: 410,
  INVITATION_EMAIL_MISMATCH: 403, LAST_OWNER_REQUIRED: 409, IDEMPOTENCY_KEY_REQUIRED: 400,
  IDEMPOTENCY_KEY_REUSED: 409, RATE_LIMITED: 429, CONFLICT: 409, INTERNAL_ERROR: 500
} as const;

export function errorResponse(error: unknown, correlationId: string): Response {
  const domainError = error instanceof DomainError ? error : error instanceof ZodError
    ? new DomainError("VALIDATION_FAILED", "Požadavek obsahuje neplatná data.")
    : new DomainError("INTERNAL_ERROR", "Unexpected server error.");
  writeSecurityLog({ correlationId, code: domainError.code,
    event: domainError.code === "INTERNAL_ERROR" ? "http.internal_error" : "http.request_rejected" });
  const message = domainError.code === "INTERNAL_ERROR" ? "Došlo k neočekávané chybě." : domainError.message;
  return Response.json(
    { ok: false, error: { code: domainError.code, message, correlationId } },
    { status: statusByCode[domainError.code], headers: { "Cache-Control": "no-store" } }
  );
}
