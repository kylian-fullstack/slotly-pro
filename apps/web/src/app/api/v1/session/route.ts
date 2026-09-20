import { randomUUID } from "node:crypto";
import { getContainer } from "@/server/container";
import { DomainError } from "@slotly/domain";
import { cookieValue } from "@/server/http/pipeline";
import { errorResponse } from "@/server/http/errors";
import { createCsrfToken } from "@/server/security/csrf";

export async function GET(request: Request): Promise<Response> {
  const correlationId = request.headers.get("x-correlation-id") ?? randomUUID();
  try {
    const rawToken = cookieValue(request.headers.get("cookie"), "slotly_session");
    if (!rawToken) throw new DomainError("AUTHENTICATION_REQUIRED", "Přihlášení je vyžadováno.");
    const services = getContainer();
    const session = await services.sessions.findActiveByDigest(services.secrets.digest(rawToken));
    if (!session) throw new DomainError("SESSION_EXPIRED", "Relace vypršela.");
    return Response.json({ ok: true, data: {
      userId: session.userId, organizationId: session.organizationId, membershipId: session.membershipId,
      role: session.role, csrfToken: createCsrfToken(session.id, services.environment.SESSION_SECRET)
    } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error, correlationId); }
}
