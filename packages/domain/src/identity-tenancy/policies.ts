import type { Membership, MembershipRole } from "./entities";

export const capabilities = ["READ_ORGANIZATION", "UPDATE_ORGANIZATION", "INVITE_STAFF", "MANAGE_STAFF", "INVITE_ADMIN", "MANAGE_ADMIN", "MANAGE_OWNER", "READ_AUDIT"] as const;
export type Capability = (typeof capabilities)[number];
export type DenialReason = "INACTIVE_MEMBERSHIP" | "TENANT_BOUNDARY" | "INSUFFICIENT_ROLE";
export type AuthorizationDecision = { readonly allowed: true } | { readonly allowed: false; readonly reason: DenialReason };

const allowedRoles: Readonly<Record<Capability, readonly MembershipRole[]>> = {
  READ_ORGANIZATION: ["OWNER", "ADMIN", "STAFF"],
  UPDATE_ORGANIZATION: ["OWNER", "ADMIN"],
  INVITE_STAFF: ["OWNER", "ADMIN"],
  MANAGE_STAFF: ["OWNER", "ADMIN"],
  INVITE_ADMIN: ["OWNER"],
  MANAGE_ADMIN: ["OWNER"],
  MANAGE_OWNER: ["OWNER"],
  READ_AUDIT: ["OWNER", "ADMIN"]
};

export function authorize(actor: Membership, capability: Capability, target?: Pick<Membership, "organizationId">): AuthorizationDecision {
  if (actor.status !== "ACTIVE") return { allowed: false, reason: "INACTIVE_MEMBERSHIP" };
  if (target && actor.organizationId !== target.organizationId) return { allowed: false, reason: "TENANT_BOUNDARY" };
  if (!allowedRoles[capability].includes(actor.role)) return { allowed: false, reason: "INSUFFICIENT_ROLE" };
  return { allowed: true };
}
