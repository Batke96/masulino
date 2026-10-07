import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { loadRootEnv } from "./load-env";

loadRootEnv();

const migrationsDir = resolve(process.cwd(), "packages/database/migrations");

export async function migrate(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  await client.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  const applied = new Set(
    (await client.query<{ id: string }>("select id from schema_migrations")).rows.map((row) => row.id),
  );
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(resolve(migrationsDir, file), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into schema_migrations (id) values ($1)", [file]);
      await client.query("commit");
      console.log(`applied ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
  await client.end();
}

const url = process.env.DATABASE_URL_MIGRATE;
if (url && process.argv[1]?.endsWith("migrate.ts")) {
  await migrate(url);
}
