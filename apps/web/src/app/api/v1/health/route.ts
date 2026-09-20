import { randomUUID } from "node:crypto";
import { getContainer } from "@/server/container";
import { errorResponse } from "@/server/http/errors";

export async function GET(request: Request): Promise<Response> {
  const correlationId = request.headers.get("x-correlation-id") ?? randomUUID();
  try {
    const services = getContainer();
    await services.pool.query("SELECT 1");
    return Response.json({ ok: true, data: { status: "ready" } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error, correlationId); }
}
