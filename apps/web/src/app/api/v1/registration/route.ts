import { createHash, randomUUID } from "node:crypto";
import { idempotencyKeySchema, registrationRequestSchema } from "@slotly/contracts";
import { DomainError } from "@slotly/domain";
import { getContainer } from "@/server/container";
import { registerOwner } from "@/server/identity-tenancy/registration-service";
import { errorResponse } from "@/server/http/errors";
import { enforceRateLimit } from "@/server/security/rate-limit";

export async function POST(request: Request): Promise<Response> {
  const correlationId = request.headers.get("x-correlation-id") ?? randomUUID();
  try {
    const key = request.headers.get("idempotency-key");
    if (!key) throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key je vyžadován.");
    idempotencyKeySchema.parse(key);
    const input = registrationRequestSchema.parse(await request.json());
    const services = getContainer();
    await enforceRateLimit(`registration:${input.email}`, { limit: 5, windowSeconds: 900,
      digest: services.secrets.digest, consume: (digest, limit, window) => services.rateLimits.consume(digest, limit, window) });
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const outcome = await services.idempotency.run(
      "registration", key, fingerprint, new Date(Date.now() + 24 * 3_600_000),
      async (client) => {
        const result = await registerOwner(input, {
          enabled: services.environment.PUBLIC_REGISTRATION_ENABLED,
          passwords: services.passwords,
          persistence: { registerOwner: (record) => services.registrations.registerOwnerWithClient(record, client) }
        });
        return { status: 201, body: { ok: true, data: result } };
      }
    );
    return Response.json(outcome.body, { status: outcome.status, headers: {
      "Cache-Control": "no-store", "Idempotency-Replayed": String(outcome.replayed)
    } });
  } catch (error) { return errorResponse(error, correlationId); }
}
