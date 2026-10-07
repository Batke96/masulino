import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { migrate } from "./migrate";
import { ensureRoles } from "./roles";

const port = 54330;
const databaseDir = resolve(process.cwd(), ".data/pg-test");

export default async function setup() {
  if (process.env.CI === "true" && process.env.DATABASE_URL_MIGRATE) {
    await ensureRoles(process.env.DATABASE_URL_MIGRATE);
    await migrate(process.env.DATABASE_URL_MIGRATE);
    writeEnv({
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      DATABASE_URL_AUTH: process.env.DATABASE_URL_AUTH ?? "",
      DATABASE_URL_WORKER: process.env.DATABASE_URL_WORKER ?? "",
      DATABASE_URL_MIGRATE: process.env.DATABASE_URL_MIGRATE,
    });
    return;
  }

  mkdirSync(databaseDir, { recursive: true });
  const postgres = new EmbeddedPostgres({
    databaseDir,
    port,
    user: "postgres",
    password: "postgres",
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=en_US.UTF-8"],
  });
  await postgres.initialise().catch(() => undefined);
  await postgres.start();
  await postgres.createDatabase("masulino_test").catch(() => undefined);
  const migrateUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/masulino_test`;
  await ensureRoles(migrateUrl);
  await migrate(migrateUrl);
  writeEnv({
    DATABASE_URL: `postgresql://masulino_app:masulino_app_local@127.0.0.1:${port}/masulino_test`,
    DATABASE_URL_AUTH: `postgresql://masulino_auth:masulino_auth_local@127.0.0.1:${port}/masulino_test`,
    DATABASE_URL_WORKER: `postgresql://masulino_worker:masulino_worker_local@127.0.0.1:${port}/masulino_test`,
    DATABASE_URL_MIGRATE: migrateUrl,
  });
  return async () => {
    await postgres.stop();
  };
}

function writeEnv(values: Record<string, string>) {
  mkdirSync(resolve(process.cwd(), ".data"), { recursive: true });
  writeFileSync(resolve(process.cwd(), ".data/test-env.json"), JSON.stringify(values));
}
