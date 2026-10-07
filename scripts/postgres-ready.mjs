import pg from "pg";

const port = 54329;

export function postgresUrl(database = "postgres") {
  return `postgresql://postgres:postgres@127.0.0.1:${port}/${database}`;
}

export async function isPostgresReady(connectionString, timeoutMs = 1000) {
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: timeoutMs,
  });
  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function waitForPostgres(connectionString, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isPostgresReady(connectionString, 1000)) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Postgres did not become ready on 127.0.0.1:54329");
}
