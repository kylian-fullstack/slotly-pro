import { DomainError } from "@slotly/domain";

export async function enforceRateLimit(
  key: string,
  options: { limit: number; windowSeconds: number; digest: (value: string) => string; consume: (digest: string, limit: number, windowSeconds: number) => Promise<{ allowed: boolean; retryAfterSeconds: number }> }
): Promise<void> {
  const result = await options.consume(options.digest(key), options.limit, options.windowSeconds);
  if (!result.allowed) throw new DomainError("RATE_LIMITED", `Příliš mnoho pokusů. Zkuste to znovu za ${result.retryAfterSeconds} sekund.`);
}
