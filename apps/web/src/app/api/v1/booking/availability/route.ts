import { availabilityReplaceSchema } from "@slotly/contracts";
import { authorize, DomainError } from "@slotly/domain";
import { getContainer } from "@/server/container";
import { membershipFromSession, runAuthenticatedMutation } from "@/server/http/pipeline";

export async function PUT(request: Request): Promise<Response> {
  const services = getContainer();
  return runAuthenticatedMutation(request, {
    authenticate: async (token) => services.sessions.findActiveByDigest(services.secrets.digest(token)),
    appOrigin: services.environment.APP_ORIGIN, csrfSecret: services.environment.SESSION_SECRET
  }, async (session) => {
    if (!authorize(membershipFromSession(session), "MANAGE_SCHEDULING").allowed) {
      throw new DomainError("FORBIDDEN", "Správa pracovní doby není povolena.");
    }
    const input = availabilityReplaceSchema.parse(await request.json());
    const availability = await services.bookings.replaceAvailability({ ...session }, input.membershipId, input.rules);
    return Response.json({ ok: true, data: { availability } }, { headers: { "Cache-Control": "no-store" } });
  });
}
