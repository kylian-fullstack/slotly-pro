import { invitationCreateSchema } from "@slotly/contracts";
import { getContainer } from "@/server/container";
import { runAuthenticatedMutation, membershipFromSession } from "@/server/http/pipeline";
import { createInvitation } from "@/server/identity-tenancy/invitation-service";

export async function POST(request: Request): Promise<Response> {
  const services = getContainer();
  return runAuthenticatedMutation(request, {
    appOrigin: services.environment.APP_ORIGIN,
    csrfSecret: services.environment.SESSION_SECRET,
    authenticate: async (token) => services.sessions.findActiveByDigest(services.secrets.digest(token))
  }, async (session) => {
    const input = invitationCreateSchema.parse(await request.json());
    const invitation = await createInvitation(membershipFromSession(session), input, {
      persistence: { create: (record) => services.invitations.create(record, session.userId) },
      secrets: services.secrets
    });
    return Response.json({ ok: true, data: invitation }, { status: 201, headers: { "Cache-Control": "no-store" } });
  });
}
