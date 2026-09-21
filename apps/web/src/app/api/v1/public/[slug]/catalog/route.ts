import { randomUUID } from "node:crypto";
import { getContainer } from "@/server/container";
import { errorResponse } from "@/server/http/errors";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  const correlationId = request.headers.get("x-correlation-id") ?? randomUUID();
  try {
    const { slug } = await context.params;
    const data = await getContainer().bookings.getPublicCatalog(slug);
    return Response.json({ ok: true, data }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } });
  } catch (error) { return errorResponse(error, correlationId); }
}
