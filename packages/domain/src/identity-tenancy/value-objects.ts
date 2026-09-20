import { DomainError } from "./errors";

declare const brand: unique symbol;
type Brand<T, Name extends string> = T & { readonly [brand]: Name };

export type UserId = Brand<string, "UserId">;
export type OrganizationId = Brand<string, "OrganizationId">;
export type MembershipId = Brand<string, "MembershipId">;
export type SessionId = Brand<string, "SessionId">;
export type InvitationId = Brand<string, "InvitationId">;
export type AuditEventId = Brand<string, "AuditEventId">;
export type NormalizedEmail = Brand<string, "NormalizedEmail">;
export type UtcTimestamp = Brand<string, "UtcTimestamp">;
export type IanaTimezone = Brand<string, "IanaTimezone">;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function invalid(message: string): never {
  throw new DomainError("VALIDATION_FAILED", message);
}

function parseId<Name extends string>(value: string, label: string): Brand<string, Name> {
  if (!uuidPattern.test(value)) return invalid(`${label} must be a valid UUID.`);
  return value.toLowerCase() as Brand<string, Name>;
}

export const parseUserId = (value: string) => parseId<"UserId">(value, "User ID");
export const parseOrganizationId = (value: string) => parseId<"OrganizationId">(value, "Organization ID");
export const parseMembershipId = (value: string) => parseId<"MembershipId">(value, "Membership ID");
export const parseSessionId = (value: string) => parseId<"SessionId">(value, "Session ID");
export const parseInvitationId = (value: string) => parseId<"InvitationId">(value, "Invitation ID");
export const parseAuditEventId = (value: string) => parseId<"AuditEventId">(value, "Audit event ID");

export function normalizeEmail(value: string): NormalizedEmail {
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  if (normalized.length > 254 || !emailPattern.test(normalized)) return invalid("Email address is invalid.");
  return normalized as NormalizedEmail;
}

export function parseUtcTimestamp(value: string): UtcTimestamp {
  const date = new Date(value);
  if (!value.endsWith("Z") || Number.isNaN(date.getTime())) {
    return invalid("Timestamp must be a valid UTC ISO-8601 value.");
  }
  return date.toISOString() as UtcTimestamp;
}

export function parseIanaTimezone(value: string): IanaTimezone {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
  } catch {
    return invalid("Timezone must be a supported IANA identifier.");
  }
  return value as IanaTimezone;
}
