import { randomUUID } from "node:crypto";
import { organizationPatchSchema } from "@slotly/contracts";
import { authorize, DomainError, parseIanaTimezone } from "@slotly/domain";
import { getContainer } from "@/server/container";
import { authenticateRequest, membershipFromSession, runAuthenticatedMutation } from "@/server/http/pipeline";
import { errorResponse } from "@/server/http/errors";

const auth = (services: ReturnType<typeof getContainer>) => ({
  authenticate: async (token: string) => services.sessions.findActiveByDigest(services.secrets.digest(token))
});

export async function GET(request: Request): Promise<Response> {
  const correlationId = request.headers.get("x-correlation-id") ?? randomUUID();
  try {
    const services = getContainer();
    const session = await authenticateRequest(request, auth(services));
    const decision = authorize(membershipFromSession(session), "READ_ORGANIZATION");
    if (!decision.allowed) throw new DomainError("FORBIDDEN", "Přístup není povolen.");
    const organization = await services.organizations.getCurrent({ ...session });
    const members = await services.organizations.listMembers({ ...session });
    return Response.json({ ok: true, data: { organization, members } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error, correlationId); }
}

export async function PATCH(request: Request): Promise<Response> {
  const services = getContainer();
  return runAuthenticatedMutation(request, {
    ...auth(services), appOrigin: services.environment.APP_ORIGIN, csrfSecret: services.environment.SESSION_SECRET
  }, async (session) => {
    const decision = authorize(membershipFromSession(session), "UPDATE_ORGANIZATION");
    if (!decision.allowed) throw new DomainError("FORBIDDEN", "Úprava organizace není povolena.");
    const input = organizationPatchSchema.parse(await request.json());
    if (input.defaultTimezone) parseIanaTimezone(input.defaultTimezone);
    const organization = await services.organizations.updateCurrent({ ...session }, {
      ...(input.displayName ? { displayName: input.displayName } : {}),
      ...(input.defaultTimezone ? { defaultTimezone: input.defaultTimezone } : {})
    });
    return Response.json({ ok: true, data: { organization } }, { headers: { "Cache-Control": "no-store" } });
  });
}
