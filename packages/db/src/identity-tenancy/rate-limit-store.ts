import type { Pool } from "pg";

export class RateLimitStore {
  constructor(private readonly pool: Pool) {}

  async consume(keyDigest: string, limit: number, windowSeconds: number, now = new Date()): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const windowMs = windowSeconds * 1000;
    const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    const expiresAt = new Date(windowStart.getTime() + windowMs * 2);
    const result = await this.pool.query<{ hits: number }>(
      `INSERT INTO security_rate_limits (key_digest, window_start, hits, expires_at)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (key_digest, window_start)
       DO UPDATE SET hits = security_rate_limits.hits + 1
       RETURNING hits`,
      [keyDigest, windowStart, expiresAt]
    );
    const remainingMs = windowStart.getTime() + windowMs - now.getTime();
    return { allowed: (result.rows[0]?.hits ?? limit + 1) <= limit, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
  }
}
