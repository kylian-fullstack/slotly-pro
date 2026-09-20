import { randomUUID } from "node:crypto";
import type { InvitationRecord } from "@slotly/db";
import { authorize, DomainError } from "@slotly/domain";
import type { Membership, MembershipRole, SecretGenerator } from "@slotly/domain";

interface InvitationPersistence { create(record: InvitationRecord): Promise<void>; }
interface CreateInvitationInput { readonly email: string; readonly role: Exclude<MembershipRole, "OWNER">; readonly expiresInHours: number; }

export async function createInvitation(
  actor: Membership,
  input: CreateInvitationInput,
  dependencies: { readonly persistence: InvitationPersistence; readonly secrets: SecretGenerator; readonly createId?: () => string; readonly now?: () => Date }
): Promise<{ invitationId: string; token: string }> {
  const capability = input.role === "ADMIN" ? "INVITE_ADMIN" : "INVITE_STAFF";
  const decision = authorize(actor, capability);
  if (!decision.allowed) throw new DomainError("FORBIDDEN", "Invitation is not permitted.");
  const token = dependencies.secrets.generate(32);
  const invitationId = (dependencies.createId ?? randomUUID)();
  const now = (dependencies.now ?? (() => new Date()))();
  await dependencies.persistence.create({
    id: invitationId, organizationId: actor.organizationId, email: input.email, role: input.role,
    tokenDigest: dependencies.secrets.digest(token),
    expiresAt: new Date(now.getTime() + input.expiresInHours * 3_600_000)
  });
  return { invitationId, token };
}
