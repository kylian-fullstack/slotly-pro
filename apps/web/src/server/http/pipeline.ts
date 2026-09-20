import { randomUUID } from "node:crypto";
import { DomainError } from "@slotly/domain";
import type { Membership } from "@slotly/domain";
import { isTrustedMutationOrigin, verifyCsrfToken } from "../security/csrf";
import { errorResponse } from "./errors";

export interface RequestSession {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly membershipId: string;
  readonly role: "OWNER" | "ADMIN" | "STAFF";
}

interface PipelineDependencies {
  readonly appOrigin: string;
  readonly csrfSecret: string;
  readonly authenticate: (rawToken: string) => Promise<RequestSession | null>;
}

export function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function runAuthenticatedMutation(
  request: Request,
  dependencies: PipelineDependencies,
  handler: (session: RequestSession) => Promise<Response>
): Promise<Response> {
  const correlationId = request.headers.get("x-correlation-id") ?? randomUUID();
  try {
    const rawToken = cookieValue(request.headers.get("cookie"), "slotly_session");
    if (!rawToken) throw new DomainError("AUTHENTICATION_REQUIRED", "Přihlášení je vyžadováno.");
    const session = await dependencies.authenticate(rawToken);
    if (!session) throw new DomainError("SESSION_EXPIRED", "Relace vypršela.");
    if (!isTrustedMutationOrigin(request.headers.get("origin"), dependencies.appOrigin)) {
      throw new DomainError("CSRF_REJECTED", "Původ požadavku nebyl ověřen.");
    }
    const csrf = request.headers.get("x-csrf-token");
    if (!csrf || !verifyCsrfToken(csrf, session.id, dependencies.csrfSecret)) {
      throw new DomainError("CSRF_REJECTED", "Bezpečnostní token nebyl ověřen.");
    }
    return await handler(session);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}

export async function authenticateRequest(request: Request, dependencies: Pick<PipelineDependencies, "authenticate">): Promise<RequestSession> {
  const rawToken = cookieValue(request.headers.get("cookie"), "slotly_session");
  if (!rawToken) throw new DomainError("AUTHENTICATION_REQUIRED", "Přihlášení je vyžadováno.");
  const session = await dependencies.authenticate(rawToken);
  if (!session) throw new DomainError("SESSION_EXPIRED", "Relace vypršela.");
  return session;
}

export function membershipFromSession(session: RequestSession): Membership {
  return {
    id: session.membershipId, organizationId: session.organizationId, userId: session.userId,
    role: session.role, status: "ACTIVE", createdAt: new Date(0).toISOString()
  } as Membership;
}
