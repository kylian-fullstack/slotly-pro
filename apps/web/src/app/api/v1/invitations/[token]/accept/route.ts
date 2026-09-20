import { createHash, randomUUID } from "node:crypto";
import { idempotencyKeySchema, invitationAcceptSchema } from "@slotly/contracts";
import { DomainError } from "@slotly/domain";
import { getContainer } from "@/server/container";
import { errorResponse } from "@/server/http/errors";
import { enforceRateLimit } from "@/server/security/rate-limit";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  const correlationId = request.headers.get("x-correlation-id") ?? randomUUID();
  try {
    const key = request.headers.get("idempotency-key");
    if (!key) throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key je vyžadován.");
    idempotencyKeySchema.parse(key);
    const input = invitationAcceptSchema.parse(await request.json());
    const { token } = await context.params;
    if (token.length < 32 || token.length > 300) throw new DomainError("INVITATION_INVALID", "Pozvánka není platná.");
    const services = getContainer();
    await enforceRateLimit(`invitation:${services.secrets.digest(token)}`, { limit: 8, windowSeconds: 900,
      digest: services.secrets.digest, consume: (digest, limit, window) => services.rateLimits.consume(digest, limit, window) });
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const outcome = await services.idempotency.run(
      `invitation.accept:${services.secrets.digest(token)}`, key, fingerprint, new Date(Date.now() + 24 * 3_600_000),
      async () => {
        const passwordHash = input.password ? await services.passwords.hash(input.password) : undefined;
        const accepted = await services.invitations.accept({
          tokenDigest: services.secrets.digest(token), email: input.email,
          userId: randomUUID(), membershipId: randomUUID(), auditEventId: randomUUID(),
          ...(input.displayName ? { displayName: input.displayName } : {}),
          ...(passwordHash ? { passwordHash } : {})
        });
        return { status: 200, body: { ok: true, data: accepted } };
      }
    );
    return Response.json(outcome.body, { status: outcome.status, headers: {
      "Cache-Control": "no-store", "Idempotency-Replayed": String(outcome.replayed)
    } });
  } catch (error) { return errorResponse(error, correlationId); }
}
