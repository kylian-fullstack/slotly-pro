import pg from "pg";

const { Client } = pg;
const expectedMarker = "slotly_test_only";
const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required; refusing to inspect an implicit database.");
}

if (process.env.TEST_DATABASE_MARKER !== expectedMarker) {
  throw new Error("TEST_DATABASE_MARKER is missing or invalid; refusing destructive test access.");
}

const parsed = new URL(connectionString);
const databaseName = parsed.pathname.replace(/^\//, "");

if (!databaseName.endsWith("_test")) {
  throw new Error(`Database '${databaseName}' is not explicitly test-only.`);
}

const client = new Client({ connectionString });

try {
  await client.connect();
  const database = await client.query("SELECT current_database() AS name");
  const guard = await client.query(
    "SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()"
  );

  if (database.rows[0]?.name !== databaseName || guard.rows[0]?.marker !== expectedMarker) {
    throw new Error("Database guard verification failed; refusing destructive test access.");
  }

  process.stdout.write(`Verified isolated test database: ${databaseName}\n`);
} finally {
  await client.end();
}
