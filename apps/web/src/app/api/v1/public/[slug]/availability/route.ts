import { randomUUID } from "node:crypto";
import { publicAvailabilityQuerySchema } from "@slotly/contracts";
import { getContainer } from "@/server/container";
import { errorResponse } from "@/server/http/errors";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  const correlationId = request.headers.get("x-correlation-id") ?? randomUUID();
  try {
    const { slug } = await context.params;
    const url = new URL(request.url);
    const input = publicAvailabilityQuerySchema.parse(Object.fromEntries(url.searchParams));
    const slots = await getContainer().bookings.getAvailableSlots(slug, input.serviceId, input.providerMembershipId, input.date, new Date());
    return Response.json({ ok: true, data: { slots } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error, correlationId); }
}
