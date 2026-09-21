import { createHash, randomUUID } from "node:crypto";
import { bookingCreateSchema, idempotencyKeySchema } from "@slotly/contracts";
import { DomainError } from "@slotly/domain";
import { getContainer } from "@/server/container";
import { errorResponse } from "@/server/http/errors";
import { enforceRateLimit } from "@/server/security/rate-limit";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  const correlationId = request.headers.get("x-correlation-id") ?? randomUUID();
  try {
    const key = request.headers.get("idempotency-key");
    if (!key) throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key je vyžadován.");
    idempotencyKeySchema.parse(key);
    const { slug } = await context.params;
    const input = bookingCreateSchema.parse(await request.json());
    const services = getContainer();
    await enforceRateLimit(`booking:${slug}:${input.customerEmail}`, { limit: 10, windowSeconds: 3600,
      digest: services.secrets.digest, consume: (digest, limit, window) => services.rateLimits.consume(digest, limit, window) });
    const fingerprint = createHash("sha256").update(JSON.stringify({ slug, ...input })).digest("hex");
    const outcome = await services.idempotency.run(`public-booking:${slug}`, key, fingerprint,
      new Date(Date.now() + 24 * 3_600_000), async () => {
        const cancellationToken = services.secrets.generate(32);
        const { customerPhone, startsAt, ...bookingInput } = input;
        const booking = await services.bookings.createPublicBooking({
          id: randomUUID(), organizationSlug: slug, ...bookingInput, startsAt: new Date(startsAt),
          ...(customerPhone ? { customerPhone } : {}),
          cancellationDigest: services.secrets.digest(cancellationToken),
          confirmationCode: randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(), now: new Date()
        });
        return { status: 201, body: { ok: true, data: { booking, cancellationToken } } };
      });
    return Response.json(outcome.body, { status: outcome.status, headers: {
      "Cache-Control": "no-store", "Idempotency-Replayed": String(outcome.replayed)
    } });
  } catch (error) { return errorResponse(error, correlationId); }
}
