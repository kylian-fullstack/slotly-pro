import pg from "pg";

export function createDatabasePool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 12, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
}
