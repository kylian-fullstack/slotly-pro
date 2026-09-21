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
    if (!authorize(membershipFromSession(session), "READ_BOOKINGS").allowed) {
      throw new DomainError("FORBIDDEN", "Přístup k rezervacím není povolen.");
    }
    const url = new URL(request.url);
    const from = new Date(url.searchParams.get("from") ?? new Date(Date.now() - 7 * 86_400_000).toISOString());
    const to = new Date(url.searchParams.get("to") ?? new Date(Date.now() + 90 * 86_400_000).toISOString());
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to || to.getTime() - from.getTime() > 370 * 86_400_000) {
      throw new DomainError("VALIDATION_FAILED", "Rozsah kalendáře není platný.");
    }
    return Response.json({ ok: true, data: await services.bookings.listAdminData({ ...session }, from, to) },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error, correlationId); }
}
