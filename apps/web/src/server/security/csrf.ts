import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function signature(sessionId: string, nonce: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`${sessionId}.${nonce}`, "utf8").digest();
}

export function createCsrfToken(sessionId: string, secret: string): string {
  const nonce = randomBytes(24).toString("base64url");
  return `${nonce}.${signature(sessionId, nonce, secret).toString("base64url")}`;
}

export function verifyCsrfToken(token: string, sessionId: string, secret: string): boolean {
  const [nonce, encodedSignature, extra] = token.split(".");
  if (!nonce || !encodedSignature || extra) return false;
  try {
    const supplied = Buffer.from(encodedSignature, "base64url");
    const expected = signature(sessionId, nonce, secret);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  } catch { return false; }
}

export function isTrustedMutationOrigin(origin: string | null, appOrigin: string): boolean {
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(appOrigin).origin; } catch { return false; }
}
