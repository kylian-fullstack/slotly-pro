interface SessionCookieInput {
  readonly token: string;
  readonly maxAgeSeconds: number;
  readonly production: boolean;
}

export function buildSessionCookie(input: SessionCookieInput): string {
  if (!Number.isSafeInteger(input.maxAgeSeconds) || input.maxAgeSeconds <= 0) {
    throw new Error("Session cookie max age must be positive.");
  }
  const parts = [
    `slotly_session=${encodeURIComponent(input.token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${input.maxAgeSeconds}`
  ];
  if (input.production) parts.push("Secure");
  return parts.join("; ");
}

export function buildExpiredSessionCookie(production: boolean): string {
  return buildSessionCookie({ token: "", maxAgeSeconds: 1, production }).replace("Max-Age=1", "Max-Age=0");
}
