import { randomUUID } from "node:crypto";
import { loginRequestSchema } from "@slotly/contracts";
import { getContainer } from "@/server/container";
import { verifyLogin } from "@/server/identity-tenancy/login-service";
import { buildSessionCookie } from "@/server/security/cookie";
import { createCsrfToken } from "@/server/security/csrf";
import { errorResponse } from "@/server/http/errors";
import { enforceRateLimit } from "@/server/security/rate-limit";

let dummyHash: Promise<string> | undefined;

export async function POST(request: Request): Promise<Response> {
  const correlationId = request.headers.get("x-correlation-id") ?? randomUUID();
  try {
    const input = loginRequestSchema.parse(await request.json());
    const services = getContainer();
    await enforceRateLimit(`login:${input.email}`, { limit: 8, windowSeconds: 300,
      digest: services.secrets.digest, consume: (digest, limit, window) => services.rateLimits.consume(digest, limit, window) });
    dummyHash ??= services.passwords.hash("slotly-dummy-password-never-used");
    const credential = await verifyLogin(input.email, input.password, {
      credentials: services.credentials, passwords: services.passwords, dummyPasswordHash: await dummyHash
    });
    const rawToken = services.secrets.generate(32);
    const sessionId = randomUUID();
    const maxAgeSeconds = 60 * 60 * 12;
    await services.sessions.create({
      id: sessionId, organizationId: credential.organizationId, membershipId: credential.membershipId,
      userId: credential.userId, tokenDigest: services.secrets.digest(rawToken),
      expiresAt: new Date(Date.now() + maxAgeSeconds * 1000)
    });
    return Response.json({ ok: true, data: {
      userId: credential.userId, organizationId: credential.organizationId,
      csrfToken: createCsrfToken(sessionId, services.environment.SESSION_SECRET)
    } }, { headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": buildSessionCookie({ token: rawToken, maxAgeSeconds, production: services.environment.NODE_ENV === "production" })
    } });
  } catch (error) { return errorResponse(error, correlationId); }
}
