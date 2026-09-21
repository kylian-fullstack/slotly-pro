import { randomUUID } from "node:crypto";
import { bookingCancellationSchema } from "@slotly/contracts";
import { getContainer } from "@/server/container";
import { errorResponse } from "@/server/http/errors";
import { enforceRateLimit } from "@/server/security/rate-limit";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  const correlationId = request.headers.get("x-correlation-id") ?? randomUUID();
  try {
    const { slug } = await context.params;
    const input = bookingCancellationSchema.parse(await request.json());
    const services = getContainer();
    await enforceRateLimit(`booking-cancel:${slug}:${input.confirmationCode}`, { limit: 10, windowSeconds: 3600,
      digest: services.secrets.digest, consume: (digest, limit, window) => services.rateLimits.consume(digest, limit, window) });
    const booking = await services.bookings.cancelPublicBooking(slug, input.confirmationCode,
      services.secrets.digest(input.cancellationToken), new Date());
    return Response.json({ ok: true, data: { booking } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error, correlationId); }
}
