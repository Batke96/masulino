import { randomUUID } from "node:crypto";
import pg from "pg";
import { loadRootEnv } from "./load-env";

loadRootEnv();

/**
 * Production bootstrap originally created a tenant without a location.
 * /api/session needs at least one active location for workplace scope.
 * Safe to re-run: skips tenants that already have a location.
 */
const migrateUrl = process.env.DATABASE_URL_MIGRATE;
if (!migrateUrl) throw new Error("Missing DATABASE_URL_MIGRATE");

const client = new pg.Client({ connectionString: migrateUrl });
await client.connect();
const missing = await client.query<{ id: string; name: string }>(`
  select t.id, t.name
  from tenants t
  where not exists (
    select 1 from locations l where l.tenant_id = t.id and l.status = 'active'
  )
`);
if (missing.rowCount === 0) {
  console.log("Every tenant already has an active location.");
  await client.end();
  process.exit(0);
}

for (const tenant of missing.rows) {
  const locationId = randomUUID();
  await client.query(
    `insert into locations (id, tenant_id, slug, name, timezone)
     values ($1, $2, 'hauptstandort', $3, 'Europe/Berlin')`,
    [locationId, tenant.id, tenant.name],
  );
  console.log(`Created location hauptstandort for tenant ${tenant.name}.`);
}
await client.end();
