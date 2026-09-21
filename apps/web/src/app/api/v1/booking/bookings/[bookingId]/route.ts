import { bookingStatusPatchSchema, uuidSchema } from "@slotly/contracts";
import { authorize, DomainError } from "@slotly/domain";
import { getContainer } from "@/server/container";
import { membershipFromSession, runAuthenticatedMutation } from "@/server/http/pipeline";

export async function PATCH(request: Request, context: { params: Promise<{ bookingId: string }> }): Promise<Response> {
  const services = getContainer();
  return runAuthenticatedMutation(request, {
    authenticate: async (token) => services.sessions.findActiveByDigest(services.secrets.digest(token)),
    appOrigin: services.environment.APP_ORIGIN, csrfSecret: services.environment.SESSION_SECRET
  }, async (session) => {
    if (!authorize(membershipFromSession(session), "MANAGE_BOOKINGS").allowed) {
      throw new DomainError("FORBIDDEN", "Správa rezervací není povolena.");
    }
    const { bookingId } = await context.params;
    const input = bookingStatusPatchSchema.parse(await request.json());
    const booking = await services.bookings.updateBookingStatus({ ...session }, uuidSchema.parse(bookingId), input.status);
    return Response.json({ ok: true, data: { booking } }, { headers: { "Cache-Control": "no-store" } });
  });
}
