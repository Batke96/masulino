import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { migrate } from "./migrate";
import { isPostgresReady, postgresUrl } from "./postgres-ready.mjs";
import { ensureRoles } from "./roles";

const port = 54329;
const databaseDir = resolve(process.cwd(), ".data/pg");
mkdirSync(databaseDir, { recursive: true });

const adminUrl = postgresUrl("postgres");
const migrateUrl = postgresUrl("masulino");

async function ensureDatabase(): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  const existing = await client.query("select 1 from pg_database where datname = 'masulino'");
  if (existing.rowCount === 0) {
    await client.query("create database masulino");
  }
  await client.end();
}

async function prepare(): Promise<void> {
  await ensureDatabase();
  await ensureRoles(migrateUrl);
  await migrate(migrateUrl);
}

const postgres = new EmbeddedPostgres({
  databaseDir,
  port,
  user: "postgres",
  password: "postgres",
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=en_US.UTF-8"],
});

let ownsServer = false;

if (await isPostgresReady(adminUrl)) {
  console.log("Local Postgres is already running on 127.0.0.1:54329. Reusing it.");
} else {
  await postgres.initialise().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("already")) throw error;
  });
  try {
    await postgres.start();
    ownsServer = true;
  } catch (error: unknown) {
    if (!(await isPostgresReady(adminUrl))) {
      const detail =
        error instanceof Error
          ? error.message
          : "Postgres exited before it accepted connections. Another postmaster may already be using .data/pg.";
      throw new Error(detail);
    }
    console.log("Local Postgres is already running on 127.0.0.1:54329. Reusing it.");
  }
}

await prepare();

if (!ownsServer) {
  console.log("Migrations are current. Leaving the existing Postgres process running.");
  process.exit(0);
}

console.log("Local Postgres is ready on 127.0.0.1:54329 database masulino");
console.log("This process keeps Postgres running. Stop it with Ctrl+C.");

const shutdown = async () => {
  await postgres.stop();
  process.exit(0);
};
process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
await new Promise(() => undefined);
