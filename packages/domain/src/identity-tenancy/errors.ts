export const domainErrorCodes = [
  "AUTHENTICATION_REQUIRED", "INVALID_CREDENTIALS", "SESSION_EXPIRED", "CSRF_REJECTED",
  "FORBIDDEN", "RESOURCE_NOT_FOUND", "VALIDATION_FAILED", "REGISTRATION_DISABLED",
  "INVITATION_INVALID", "INVITATION_EXPIRED", "INVITATION_EMAIL_MISMATCH",
  "LAST_OWNER_REQUIRED", "IDEMPOTENCY_KEY_REQUIRED", "IDEMPOTENCY_KEY_REUSED",
  "RATE_LIMITED", "CONFLICT", "INTERNAL_ERROR"
] as const;

export type DomainErrorCode = (typeof domainErrorCodes)[number];

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainError };
