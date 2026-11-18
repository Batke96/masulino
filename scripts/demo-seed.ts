import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { birthdayPackages } from "../packages/contracts/src/reservations.ts";
import { tableSeats } from "../lib/booking/tables.ts";
import { ensureExampleParties } from "./example-parties.ts";
import { loadProductionOperatorEnv, loadRootEnv } from "./load-env";

/**
 * Idempotent synthetic workplace for the public Vercel demo.
 * Does not truncate. Not called from the build or from dev-workspace.
 *
 * The direct Neon URL lives in gitignored `.env.production.local`
 * (`DATABASE_URL_MIGRATE`, pooling off). Do not put that variable on Vercel.
 *
 *   MASULINO_DEMO_SEED_CONFIRM=synthetic pnpm db:demo-seed
 *
 * Do not run this against a database that already has real guests or an owner.
 * Kasse stays empty unless a CSV path is passed. This repo has no till CSV.
 *
 * When Masulino Spielwelt already exists, the command does not rebuild it.
 * It only ensures the three Tagesmappe example parties for the Berlin day
 * of this run. Other reservations stay as they are.
 */

const demoConfirm = process.env.MASULINO_DEMO_SEED_CONFIRM;
if (!demoConfirm) {
  throw new Error("Refusing to seed the demo. Set MASULINO_DEMO_SEED_CONFIRM=synthetic.");
}

loadRootEnv();
const operatorEnv = resolve(process.cwd(), ".env.production.local");
if (existsSync(operatorEnv)) loadProductionOperatorEnv();

const migrateUrl = process.env.DATABASE_URL_MIGRATE;
if (!migrateUrl) {
  throw new Error(
    "Missing DATABASE_URL_MIGRATE. Put the direct Neon URL in gitignored .env.production.local.",
  );
}

const localDatabase = migrateUrl.includes("127.0.0.1") || migrateUrl.includes("localhost");
if (!localDatabase && demoConfirm !== "synthetic") {
  throw new Error("Refusing to seed a non-local database.");
}
if (demoConfirm !== "synthetic") {
  throw new Error("Refusing to seed the demo. MASULINO_DEMO_SEED_CONFIRM must be synthetic.");
}

const csvPath = process.argv.slice(2).find((argument) => argument !== "--");
const client = new pg.Client({ connectionString: migrateUrl });
await client.connect();

const spielwelt = await client.query<{ id: string }>(
  `select id from tenants where slug = 'masulino-spielwelt' limit 1`,
);
if (spielwelt.rowCount) {
  try {
    await client.query("begin");
    const parties = await ensureExampleParties(client);
    await client.query("commit");
    console.log(
      `Masulino Spielwelt is already present. Example parties on ${parties.day}: ${parties.inserted.length} added, ${parties.updated.length} updated, ${parties.skipped.length} left alone.`,
    );
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }
  await client.end();
  process.exit(0);
}

const otherOwners = await client.query<{ slug: string }>(
  `select distinct t.slug
   from grants g
   join tenants t on t.id = g.tenant_id
   where g.role_key = 'tenant_owner'
     and t.slug is distinct from 'masulino-spielwelt'
   order by t.slug`,
);
if (otherOwners.rowCount) {
  const slugs = otherOwners.rows.map((row) => row.slug).join(", ");
  await client.end();
  console.error(`A tenant_owner grant exists for another tenant (${slugs}). No rows written.`);
  process.exit(2);
}

if (csvPath && !existsSync(csvPath)) {
  await client.end();
  throw new Error(`Till CSV not found: ${csvPath}`);
}

const { getAuth } = await import("../server/src/auth.ts");
const SYNTHETIC_PASSWORD = "Synthetic-Staff-1";
const users: Array<{ email: string; name: string; password?: string }> = [
  { email: "owner.masulino@example.test", name: "Olivia Owner" },
  { email: "reception.masulino@example.test", name: "Rene Reception" },
  { email: "employee.masulino@example.test", name: "Eva Employee" },
  { email: "manager.masulino@example.test", name: "Mara Manager" },
  { email: "revoked.masulino@example.test", name: "Ria Revoked" },
  { email: "user@example.test", name: "User", password: "password" },
  { email: "it.masulino@example.test", name: "Ira IT" },
];

const auth = getAuth();
const context = await auth.$context;
const created: Record<string, string> = {};
for (const user of users) {
  const hashed = await context.password.hash(user.password ?? SYNTHETIC_PASSWORD);
  const prior = await client.query<{ id: string }>(`select id from identity."user" where email = $1`, [user.email]);
  if (prior.rows[0]) {
    const userId = prior.rows[0].id;
    const updated = await client.query(
      `update identity.account set password = $1, updated_at = now() where user_id = $2 and provider_id = 'credential'`,
      [hashed, userId],
    );
    if (!updated.rowCount) {
      await context.internalAdapter.linkAccount({
        userId,
        accountId: userId,
        providerId: "credential",
        password: hashed,
      });
    }
    created[user.email] = userId;
    continue;
  }
  const record = await context.internalAdapter.createUser({
    email: user.email,
    name: user.name,
    emailVerified: true,
  });
  await context.internalAdapter.linkAccount({
    userId: record.id,
    accountId: record.id,
    providerId: "credential",
    password: hashed,
  });
  created[user.email] = record.id;
}

const tenantA = randomUUID();
const locationA = randomUUID();
const hours = {
  mon: { startMinute: 600, endMinute: 1080 },
  tue: { startMinute: 600, endMinute: 1080 },
  wed: { startMinute: 600, endMinute: 1080 },
  thu: { startMinute: 600, endMinute: 1080 },
  fri: { startMinute: 600, endMinute: 1080 },
  sat: { startMinute: 600, endMinute: 1080 },
  sun: { startMinute: 600, endMinute: 1080 },
};

await client.query("begin");
try {
  await client.query(
    `insert into tenants (id, slug, name) values ($1, 'masulino-spielwelt', 'Masulino Spielwelt')`,
    [tenantA],
  );
  await client.query(
    `insert into locations (id, tenant_id, slug, name, timezone) values
      ($1, $2, 'aeppelallee-biebrich', 'Äppelallee (Biebrich)', 'Europe/Berlin')`,
    [locationA, tenantA],
  );

  const issuer = "urn:masulino:better-auth";
  async function principal(userId: string, email: string, name: string) {
    const id = randomUUID();
    await client.query(
      `insert into principals (id, issuer, subject, email, display_name) values ($1, $2, $3, $4, $5)`,
      [id, issuer, userId, email, name],
    );
    return id;
  }

  const ownerA = await principal(created["owner.masulino@example.test"]!, "owner.masulino@example.test", "Olivia Owner");
  const reception = await principal(created["reception.masulino@example.test"]!, "reception.masulino@example.test", "Rene Reception");
  const employee = await principal(created["employee.masulino@example.test"]!, "employee.masulino@example.test", "Eva Employee");
  const manager = await principal(created["manager.masulino@example.test"]!, "manager.masulino@example.test", "Mara Manager");
  const revoked = await principal(created["revoked.masulino@example.test"]!, "revoked.masulino@example.test", "Ria Revoked");
  const simpleAdmin = await principal(created["user@example.test"]!, "user@example.test", "User");
  const itUser = await principal(created["it.masulino@example.test"]!, "it.masulino@example.test", "Ira IT");

  async function membership(tenantId: string, principalId: string, status: string) {
    const id = randomUUID();
    await client.query(
      `insert into memberships (id, tenant_id, principal_id, status) values ($1, $2, $3, $4)`,
      [id, tenantId, principalId, status],
    );
    return id;
  }

  const ownerMembership = await membership(tenantA, ownerA, "active");
  const receptionMembership = await membership(tenantA, reception, "active");
  const employeeMembership = await membership(tenantA, employee, "active");
  const managerMembership = await membership(tenantA, manager, "active");
  await membership(tenantA, revoked, "revoked");
  const simpleAdminMembership = await membership(tenantA, simpleAdmin, "active");
  const itMembership = await membership(tenantA, itUser, "active");

  await client.query(
    `insert into grants (tenant_id, membership_id, role_key, location_id) values
      ($1, $2, 'tenant_owner', null),
      ($1, $3, 'reception', $4),
      ($1, $5, 'employee', $4),
      ($1, $6, 'location_manager', $4),
      ($1, $7, 'tenant_owner', null),
      ($1, $8, 'it', null)`,
    [tenantA, ownerMembership, receptionMembership, locationA, employeeMembership, managerMembership, simpleAdminMembership, itMembership],
  );

  const moduleIds = [
    "core",
    "reservations",
    "notifications",
    "workforce",
    "purchasing",
    "content",
  ] as const;
  for (const moduleId of moduleIds) {
    const enabled = moduleId === "core" || moduleId === "reservations" || moduleId === "content" || moduleId === "workforce";
    await client.query(
      `insert into module_entitlements (tenant_id, module_id, enabled) values ($1, $2, $3)`,
      [tenantA, moduleId, enabled],
    );
  }
  await client.query(
    `insert into workforce_settings (tenant_id, publication_weekday) values ($1, 0)`,
    [tenantA],
  );

  const resourceIds = new Map<number, string>();
  const comboIds = new Map<number, string>();
  for (const seat of tableSeats) {
    const resourceId = randomUUID();
    const comboId = randomUUID();
    resourceIds.set(seat.id, resourceId);
    comboIds.set(seat.id, comboId);
    await client.query(
      `insert into resources (id, tenant_id, location_id, name, capacity_children) values ($1, $2, $3, $4, $5)`,
      [resourceId, tenantA, locationA, `Tisch ${seat.id}`, seat.seats],
    );
    await client.query(
      `insert into combinations (id, tenant_id, location_id, name, min_children, max_children, max_adults) values ($1, $2, $3, $4, 1, $5, 40)`,
      [comboId, tenantA, locationA, `Tisch ${seat.id}`, seat.seats],
    );
    await client.query(
      `insert into combination_resources (tenant_id, combination_id, resource_id) values ($1, $2, $3)`,
      [tenantA, comboId, resourceId],
    );
  }
  const homeSeat = tableSeats.filter((seat) => seat.seats >= 8).sort((left, right) => left.seats - right.seats || left.id - right.id)[0];
  if (!homeSeat) throw new Error("No floor table fits 8 children");
  const homeCombo = comboIds.get(homeSeat.id);
  const homeResource = resourceIds.get(homeSeat.id);
  if (!homeCombo || !homeResource) throw new Error("Floor table was not inserted");
  const packageId = randomUUID();
  await client.query(
    `insert into packages (
      id, tenant_id, location_id, name, duration_minutes, price_minor, currency, min_children, max_children, fixture
    ) values ($1, $2, $3, 'Geburtstagsfeier Fixture', 120, 25000, 'EUR', 1, 16, true)`,
    [packageId, tenantA, locationA],
  );
  for (const pkg of birthdayPackages) {
    await client.query(
      `insert into packages (
        id, tenant_id, location_id, name, duration_minutes, price_minor, currency,
        min_children, max_children, public_code, fixture
      ) values ($1, $2, $3, $4, $5, $6, $7, 1, 40, $8, false)`,
      [randomUUID(), tenantA, locationA, pkg.name, pkg.durationMinutes, pkg.priceMinor, pkg.currency, pkg.code],
    );
  }
  const ruleId = randomUUID();
  await client.query(
    `insert into venue_rules (
      id, tenant_id, location_id, version, status, timezone, buffer_before_minutes, buffer_after_minutes,
      slot_minutes, horizon_days, opening_hours, adult_seating, fixture, published_at
    ) values (
      $1, $2, $3, 1, 'published', 'Europe/Berlin', 30, 30, 30, 90, $4::jsonb, 'not_required', true, now()
    )`,
    [ruleId, tenantA, locationA, JSON.stringify(hours)],
  );
  const reservationId = randomUUID();
  await client.query(
    `insert into reservations (
      id, tenant_id, location_id, reference, status, organizer_name, organizer_email, organizer_phone,
      starts_at, ends_at, local_date, children_count, adult_count, package_id, package_name_snapshot,
      price_minor_snapshot, currency_snapshot, rule_id, rule_version_snapshot, combination_id,
      source_channel, notes, created_by_principal_id
    ) values (
      $1, $2, $3, 'MS-FIXTURE1', 'confirmed', 'Familie Beispiel', 'familie@example.test', '030000000',
      (current_date::timestamp + time '14:00') at time zone 'Europe/Berlin',
      (current_date::timestamp + time '16:00') at time zone 'Europe/Berlin',
      (timezone('Europe/Berlin', now()))::date,
      8, 4, $4, 'Geburtstagsfeier Fixture', 25000, 'EUR', $5, 1, $6, 'staff_phone', '', $7
    )`,
    [reservationId, tenantA, locationA, packageId, ruleId, homeCombo, reception],
  );
  await client.query(
    `insert into allocations (tenant_id, location_id, reservation_id, resource_id, occupancy)
     select $1, $2, $3, $4, tstzrange(
       (current_date::timestamp + time '13:30') at time zone 'Europe/Berlin',
       (current_date::timestamp + time '16:30') at time zone 'Europe/Berlin',
       '[)'
     )`,
    [tenantA, locationA, reservationId, homeResource],
  );
  await client.query(
    `insert into reservation_tasks (tenant_id, location_id, reservation_id, title, status)
     values ($1, $2, $3, 'Tische vorbereiten', 'open')`,
    [tenantA, locationA, reservationId],
  );
  await client.query(
    `insert into reservations (
      id, tenant_id, location_id, reference, status, organizer_name, organizer_email, organizer_phone,
      starts_at, ends_at, local_date, children_count, adult_count, package_id, package_name_snapshot,
      price_minor_snapshot, currency_snapshot, rule_id, rule_version_snapshot, source_channel, created_by_principal_id
    ) values (
      $1, $2, $3, 'MS-REQUEST1', 'requested', 'Familie Anfrage', 'anfrage@example.test', '030000001',
      (current_date::timestamp + time '11:00') at time zone 'Europe/Berlin',
      (current_date::timestamp + time '13:00') at time zone 'Europe/Berlin',
      (timezone('Europe/Berlin', now()))::date,
      6, 2, $4, 'Geburtstagsfeier Fixture', 25000, 'EUR', $5, 1, 'staff_walk_in', $6
    )`,
    [randomUUID(), tenantA, locationA, packageId, ruleId, reception],
  );
  await client.query(
    `insert into audit_events (
      tenant_id, actor_principal_id, action, target_type, target_id, outcome, correlation_id, changes
    ) values ($1, $2, 'seed.synthetic', 'tenant', $4, 'success', $3, '{}'::jsonb)`,
    [tenantA, ownerA, randomUUID(), tenantA],
  );
  const claimA = randomUUID();
  const claimB = randomUUID();
  await client.query(
    `insert into reservations (
       id, tenant_id, location_id, reference, status, organizer_name, organizer_email, organizer_phone,
       starts_at, ends_at, local_date, children_count, adult_count, package_id, package_name_snapshot,
       price_minor_snapshot, currency_snapshot, rule_id, rule_version_snapshot, source_channel, created_by_principal_id
     ) values
       ($1, $3, $4, 'MS-CLAIM-A', 'confirmed', 'Familie Anspruch', 'shared.fixture@example.test', '030000010',
        '2027-06-01 14:00:00+02', '2027-06-01 16:00:00+02', '2027-06-01', 6, 2, $5, 'Geburtstagsfeier Fixture',
        25000, 'EUR', $6, 1, 'staff_phone', $7),
       ($2, $3, $4, 'MS-CLAIM-B', 'confirmed', 'Familie Andere', 'shared.fixture@example.test', '030000011',
        '2027-06-01 11:00:00+02', '2027-06-01 13:00:00+02', '2027-06-01', 4, 2, $5, 'Geburtstagsfeier Fixture',
        25000, 'EUR', $6, 1, 'staff_phone', $7)`,
    [claimA, claimB, tenantA, locationA, packageId, ruleId, reception],
  );
  const parties = await ensureExampleParties(client);
  console.log(
    `Example parties on ${parties.day}: ${parties.inserted.join(", ") || "none"}.`,
  );
  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
}
await client.end();

if (csvPath) {
  await importTillCsv(csvPath);
} else {
  console.log("Kasse left empty. No till CSV was passed.");
}

console.log("Synthetic demo seed complete.");
console.log("Password for the role fixtures: Synthetic-Staff-1");
console.log("Demo admin: user@example.test / password");
console.log("Masulino Spielwelt / Äppelallee: owner.masulino@example.test, it.masulino@example.test, manager.masulino@example.test, reception.masulino@example.test, employee.masulino@example.test");
console.log("Revoked login: revoked.masulino@example.test");

function importTillCsv(filePath: string): Promise<void> {
  const child = spawn("pnpm", ["exec", "tsx", "scripts/import-pos-csv.ts", filePath], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  return new Promise((resolvePromise, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`Till import exited with ${code ?? "no"} code`));
    });
  });
}
