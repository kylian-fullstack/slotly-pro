import { DomainError } from "@slotly/domain";
import type { Pool, PoolClient } from "pg";

interface IdempotentResponse { readonly status: number; readonly body: unknown; }
interface StoredRow { readonly request_fingerprint: string; readonly response_status: number | null; readonly response_body: unknown; }

export class IdempotencyStore {
  constructor(private readonly pool: Pool) {}

  async run(
    scope: string,
    key: string,
    fingerprint: string,
    expiresAt: Date,
    operation: (client: PoolClient) => Promise<IdempotentResponse>
  ): Promise<IdempotentResponse & { replayed: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const claimed = await client.query(
        `INSERT INTO idempotency_records
          (id, operation_scope, idempotency_key, request_fingerprint, expires_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)
         ON CONFLICT (operation_scope, idempotency_key) DO NOTHING RETURNING id`,
        [scope, key, fingerprint, expiresAt]
      );
      if (claimed.rowCount === 1) {
        const response = await operation(client);
        await client.query(
          `UPDATE idempotency_records SET response_status = $1, response_body = $2
            WHERE operation_scope = $3 AND idempotency_key = $4`,
          [response.status, JSON.stringify(response.body), scope, key]
        );
        await client.query("COMMIT");
        return { ...response, replayed: false };
      }

      const existing = await client.query<StoredRow>(
        `SELECT request_fingerprint, response_status, response_body
           FROM idempotency_records WHERE operation_scope = $1 AND idempotency_key = $2 FOR UPDATE`,
        [scope, key]
      );
      const row = existing.rows[0];
      if (!row || row.request_fingerprint !== fingerprint) {
        throw new DomainError("IDEMPOTENCY_KEY_REUSED", "Idempotency key was reused with a different request.");
      }
      if (row.response_status === null) throw new DomainError("CONFLICT", "Idempotent operation has no terminal response.");
      await client.query("COMMIT");
      return { status: row.response_status, body: row.response_body, replayed: true };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve original failure. */ }
      throw error;
    } finally { client.release(); }
  }
}
