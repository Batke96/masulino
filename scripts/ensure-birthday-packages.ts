import { randomUUID } from "node:crypto";
import pg from "pg";
import { birthdayPackages } from "@masulino/contracts";
import { loadRootEnv } from "./load-env";

loadRootEnv();

/**
 * Insert Comfort and Deluxe on the published venue when they are missing.
 * Safe to re-run. Does not change a package that already has that public_code.
 *
 *   MASULINO_PUBLIC_VENUE_SLUG=masulino-berlin pnpm db:birthday-packages
 */
const slug = process.env.MASULINO_PUBLIC_VENUE_SLUG?.trim();
const migrateUrl = process.env.DATABASE_URL_MIGRATE;
if (!slug || !/^[a-z0-9-]{3,80}$/.test(slug)) {
  throw new Error("Set MASULINO_PUBLIC_VENUE_SLUG to the published venue slug.");
}
if (!migrateUrl) throw new Error("Missing DATABASE_URL_MIGRATE");

const client = new pg.Client({ connectionString: migrateUrl });
await client.connect();
const venue = await client.query<{ tenant_id: string; location_id: string }>(
  `select tenant_id, location_id from published_venues where public_slug = $1 and status = 'published'`,
  [slug],
);
const row = venue.rows[0];
if (!row) {
  await client.end();
  throw new Error(`No published venue with slug ${slug}.`);
}

for (const pkg of birthdayPackages) {
  const existing = await client.query<{ id: string }>(
    `select id from packages where tenant_id = $1 and location_id = $2 and public_code = $3`,
    [row.tenant_id, row.location_id, pkg.code],
  );
  if (existing.rows[0]) {
    console.log(`${pkg.code} already exists.`);
    continue;
  }
  await client.query(
    `insert into packages (
      id, tenant_id, location_id, name, duration_minutes, price_minor, currency,
      min_children, max_children, public_code, fixture
    ) values ($1, $2, $3, $4, $5, $6, $7, 1, 40, $8, false)`,
    [
      randomUUID(),
      row.tenant_id,
      row.location_id,
      pkg.name,
      pkg.durationMinutes,
      pkg.priceMinor,
      pkg.currency,
      pkg.code,
    ],
  );
  console.log(`Inserted ${pkg.name} (${pkg.priceMinor} cents).`);
}
await client.end();
