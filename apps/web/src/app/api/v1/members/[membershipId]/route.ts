import { membershipPatchSchema } from "@slotly/contracts";
import { authorize, DomainError } from "@slotly/domain";
import type { Capability, Membership } from "@slotly/domain";
import { getContainer } from "@/server/container";
import { membershipFromSession, runAuthenticatedMutation } from "@/server/http/pipeline";

function capabilityFor(role: Membership["role"]): Capability {
  if (role === "OWNER") return "MANAGE_OWNER";
  if (role === "ADMIN") return "MANAGE_ADMIN";
  return "MANAGE_STAFF";
}

async function authorizeTarget(services: ReturnType<typeof getContainer>, session: Parameters<typeof membershipFromSession>[0], membershipId: string) {
  const target = await services.memberships.find(session.organizationId, membershipId);
  if (!target) throw new DomainError("RESOURCE_NOT_FOUND", "Člen nebyl nalezen.");
  const decision = authorize(membershipFromSession(session), capabilityFor(target.role), target as unknown as Membership);
  if (!decision.allowed) throw new DomainError("FORBIDDEN", "Správa tohoto člena není povolena.");
  return target;
}

export async function PATCH(request: Request, context: { params: Promise<{ membershipId: string }> }): Promise<Response> {
  const services = getContainer();
  return runAuthenticatedMutation(request, {
    appOrigin: services.environment.APP_ORIGIN, csrfSecret: services.environment.SESSION_SECRET,
    authenticate: async (token) => services.sessions.findActiveByDigest(services.secrets.digest(token))
  }, async (session) => {
    const { membershipId } = await context.params;
    await authorizeTarget(services, session, membershipId);
    const input = membershipPatchSchema.parse(await request.json());
    if (input.role) await services.memberships.changeRole({ organizationId: session.organizationId,
      targetMembershipId: membershipId, nextRole: input.role, actorUserId: session.userId });
    if (input.status) await services.memberships.changeStatus({ organizationId: session.organizationId,
      targetMembershipId: membershipId, nextStatus: input.status, actorUserId: session.userId });
    return Response.json({ ok: true, data: { membershipId } }, { headers: { "Cache-Control": "no-store" } });
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ membershipId: string }> }): Promise<Response> {
  const services = getContainer();
  return runAuthenticatedMutation(request, {
    appOrigin: services.environment.APP_ORIGIN, csrfSecret: services.environment.SESSION_SECRET,
    authenticate: async (token) => services.sessions.findActiveByDigest(services.secrets.digest(token))
  }, async (session) => {
    const { membershipId } = await context.params;
    await authorizeTarget(services, session, membershipId);
    await services.memberships.remove({ organizationId: session.organizationId, targetMembershipId: membershipId, actorUserId: session.userId });
    return Response.json({ ok: true, data: { removed: true } }, { headers: { "Cache-Control": "no-store" } });
  });
}
