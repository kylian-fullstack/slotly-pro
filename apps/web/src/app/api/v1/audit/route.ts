import { randomUUID } from "node:crypto";
import { authorize, DomainError } from "@slotly/domain";
import { getContainer } from "@/server/container";
import { authenticateRequest, membershipFromSession } from "@/server/http/pipeline";
import { errorResponse } from "@/server/http/errors";

export async function GET(request: Request): Promise<Response> {
  const correlationId = request.headers.get("x-correlation-id") ?? randomUUID();
  try {
    const services = getContainer();
    const session = await authenticateRequest(request, {
      authenticate: async (token) => services.sessions.findActiveByDigest(services.secrets.digest(token))
    });
    if (!authorize(membershipFromSession(session), "READ_AUDIT").allowed) {
      throw new DomainError("FORBIDDEN", "Audit není pro tuto roli dostupný.");
    }
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 25) || 25, 1), 100);
    const beforeRaw = url.searchParams.get("before");
    const before = beforeRaw ? new Date(beforeRaw) : undefined;
    if (before && Number.isNaN(before.getTime())) throw new DomainError("VALIDATION_FAILED", "Neplatný kurzor.");
    const events = await services.organizations.listAudit({ ...session }, limit + 1, before);
    const hasMore = events.length > limit;
    const page = events.slice(0, limit);
    return Response.json({ ok: true, data: { events: page, nextCursor: hasMore ? page.at(-1)?.occurredAt.toISOString() : null } },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error, correlationId); }
}
