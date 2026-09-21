import { randomUUID } from "node:crypto";
import { serviceCreateSchema } from "@slotly/contracts";
import { authorize, DomainError } from "@slotly/domain";
import { getContainer } from "@/server/container";
import { membershipFromSession, runAuthenticatedMutation } from "@/server/http/pipeline";

export async function POST(request: Request): Promise<Response> {
  const services = getContainer();
  return runAuthenticatedMutation(request, {
    authenticate: async (token) => services.sessions.findActiveByDigest(services.secrets.digest(token)),
    appOrigin: services.environment.APP_ORIGIN, csrfSecret: services.environment.SESSION_SECRET
  }, async (session) => {
    if (!authorize(membershipFromSession(session), "MANAGE_SCHEDULING").allowed) {
      throw new DomainError("FORBIDDEN", "Správa služeb není povolena.");
    }
    const input = serviceCreateSchema.parse(await request.json());
    const service = await services.bookings.createService({ ...session }, { id: randomUUID(), ...input });
    return Response.json({ ok: true, data: { service } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  });
}
