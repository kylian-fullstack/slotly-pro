import { DomainError } from "./errors";
import type { AuditEventId, IanaTimezone, InvitationId, MembershipId, NormalizedEmail, OrganizationId, SessionId, UserId, UtcTimestamp } from "./value-objects";

export const membershipRoles = ["OWNER", "ADMIN", "STAFF"] as const;
export type MembershipRole = (typeof membershipRoles)[number];
export const lifecycleStatuses = ["ACTIVE", "SUSPENDED", "DELETED"] as const;
export type LifecycleStatus = (typeof lifecycleStatuses)[number];
export type MembershipStatus = Exclude<LifecycleStatus, "DELETED">;
export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED";

export interface User { readonly id: UserId; readonly email: NormalizedEmail; readonly displayName: string; readonly passwordHash: string; readonly status: LifecycleStatus; readonly createdAt: UtcTimestamp; }
export interface Organization { readonly id: OrganizationId; readonly slug: string; readonly displayName: string; readonly defaultTimezone: IanaTimezone; readonly status: LifecycleStatus; readonly createdAt: UtcTimestamp; }
export interface Membership { readonly id: MembershipId; readonly organizationId: OrganizationId; readonly userId: UserId; readonly role: MembershipRole; readonly status: MembershipStatus; readonly createdAt: UtcTimestamp; }
export interface Session { readonly id: SessionId; readonly organizationId: OrganizationId; readonly membershipId: MembershipId; readonly userId: UserId; readonly tokenDigest: string; readonly expiresAt: UtcTimestamp; readonly revokedAt: UtcTimestamp | null; readonly createdAt: UtcTimestamp; }
export interface Invitation { readonly id: InvitationId; readonly organizationId: OrganizationId; readonly email: NormalizedEmail; readonly role: MembershipRole; readonly tokenDigest: string; readonly status: InvitationStatus; readonly expiresAt: UtcTimestamp; readonly acceptedAt: UtcTimestamp | null; readonly createdAt: UtcTimestamp; }
export interface AuditEvent { readonly id: AuditEventId; readonly organizationId: OrganizationId | null; readonly actorUserId: UserId | null; readonly action: string; readonly targetType: string; readonly targetId: string; readonly occurredAt: UtcTimestamp; readonly metadata: Readonly<Record<string, string | number | boolean | null>>; }

export function createMembership(input: Membership): Membership {
  if (!membershipRoles.includes(input.role)) throw new DomainError("VALIDATION_FAILED", "Membership role is invalid.");
  if (input.status !== "ACTIVE" && input.status !== "SUSPENDED") throw new DomainError("VALIDATION_FAILED", "Membership status is invalid.");
  return Object.freeze({ ...input });
}
