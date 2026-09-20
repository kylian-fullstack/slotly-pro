import { getContainer } from "@/server/container";
import { runAuthenticatedMutation } from "@/server/http/pipeline";
import { buildExpiredSessionCookie } from "@/server/security/cookie";

export async function POST(request: Request): Promise<Response> {
  const services = getContainer();
  return runAuthenticatedMutation(request, {
    appOrigin: services.environment.APP_ORIGIN,
    csrfSecret: services.environment.SESSION_SECRET,
    authenticate: async (rawToken) => services.sessions.findActiveByDigest(services.secrets.digest(rawToken))
  }, async (session) => {
    await services.sessions.revoke(session.id);
    return Response.json({ ok: true, data: { loggedOut: true } }, { headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": buildExpiredSessionCookie(services.environment.NODE_ENV === "production")
    } });
  });
}
