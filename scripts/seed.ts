import { randomUUID } from "node:crypto";
import pg from "pg";
import { birthdayPackages } from "@masulino/contracts";
import { tableSeats } from "../lib/booking/tables.ts";
import { loadRootEnv } from "./load-env";

loadRootEnv();

if (process.env.NODE_ENV === "production" || process.env.MASULINO_SEED_CONFIRM !== "synthetic") {
  throw new Error("Refusing to seed. Set MASULINO_SEED_CONFIRM=synthetic and do not run in production.");
}

const migrateUrl = process.env.DATABASE_URL_MIGRATE;
if (!migrateUrl || !migrateUrl.includes("127.0.0.1") && !migrateUrl?.includes("localhost")) {
  throw new Error("Refusing to seed a non-local database");
}

const client = new pg.Client({ connectionString: migrateUrl });
await client.connect();
await client.query(`delete from identity."user" where email like '%@example.test'`);

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
const posReady = await client.query<{ ready: string | null }>("select to_regclass('pos.lines')::text as ready");
if (posReady.rows[0]?.ready) {
  await client.query(`
    create temp table pos_lines_keep on commit drop as
    select
      t.slug as tenant_slug,
      l.name as location_name,
      p.source, p.external_invoice_id, p.external_item_id, p.import_key,
      p.z_bon, p.booked_on, p.booked_at, p.invoice_number, p.payment_method,
      p.product_name, p.product_group, p.quantity, p.unit_gross, p.unit_net,
      p.discount_gross, p.discount_net, p.line_gross, p.line_net,
      p.vat_rate, p.vat_amount, p.business_date, p.site_name, p.category
    from pos.lines p
    join locations l on l.tenant_id = p.tenant_id and l.id = p.location_id
    join tenants t on t.id = p.tenant_id
    where l.name = 'Äppelallee (Biebrich)'
  `);
  await client.query(`
    create temp table pos_categories_keep on commit drop as
    select
      t.slug as tenant_slug,
      c.product_name, c.category, c.group_key, c.role, c.count_in_quantity, c.count_in_revenue
    from pos.product_categories c
    join tenants t on t.id = c.tenant_id
  `);
}
await client.query(`
    truncate table
    time_effective_entries, time_correction_requests, time_punches, schedule_shifts, schedule_plans,
    leave_entries, availability_windows, availability_revisions, workforce_settings,
    allocations, reservation_tasks, reservations, idempotency_keys, notification_previews,
    rate_buckets, outbox_jobs, combination_resources, combinations, packages, venue_rules,
    closures, resources, staff_invitations, grants, memberships, module_entitlements,
    locations, audit_events, security_events, principals, tenants
  restart identity cascade
`);
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
await client.query(
  `insert into grants (tenant_id, membership_id, role_key, location_id) values
    ($1, $2, 'tenant_administrator', null),
    ($1, $2, 'it', null),
    ($1, $2, 'location_manager', $3),
    ($1, $2, 'shift_lead', $3),
    ($1, $2, 'reception', $3),
    ($1, $2, 'employee', $3)`,
  [tenantA, simpleAdminMembership, locationA],
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
if (posReady.rows[0]?.ready) {
  await client.query(`
    insert into locations (id, tenant_id, slug, name, timezone)
    select
      gen_random_uuid(),
      t.id,
      left(trim(both '-' from regexp_replace(
        replace(replace(replace(replace(lower(k.location_name), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
        '[^a-z0-9]+', '-', 'g'
      )), 48),
      k.location_name,
      'Europe/Berlin'
    from (select distinct tenant_slug, location_name from pos_lines_keep) k
    join tenants t on t.slug = k.tenant_slug
    where not exists (
      select 1 from locations l where l.tenant_id = t.id and l.name = k.location_name
    )
  `);
  await client.query(`
    insert into pos.lines (
      tenant_id, location_id, source, external_invoice_id, external_item_id, import_key,
      z_bon, booked_on, booked_at, invoice_number, payment_method, product_name, product_group,
      quantity, unit_gross, unit_net, discount_gross, discount_net, line_gross, line_net,
      vat_rate, vat_amount, business_date, site_name, category
    )
    select
      t.id, l.id, k.source, k.external_invoice_id, k.external_item_id, k.import_key,
      k.z_bon, k.booked_on, k.booked_at, k.invoice_number, k.payment_method, k.product_name, k.product_group,
      k.quantity, k.unit_gross, k.unit_net, k.discount_gross, k.discount_net, k.line_gross, k.line_net,
      k.vat_rate, k.vat_amount, k.business_date, k.site_name, k.category
    from pos_lines_keep k
    join tenants t on t.slug = k.tenant_slug
    join locations l on l.tenant_id = t.id and l.name = k.location_name
  `);
  await client.query(`
    insert into pos.product_categories (
      tenant_id, product_name, category, group_key, role, count_in_quantity, count_in_revenue
    )
    select t.id, k.product_name, k.category, k.group_key, k.role, k.count_in_quantity, k.count_in_revenue
    from pos_categories_keep k
    join tenants t on t.slug = k.tenant_slug
  `);
  const kept = await client.query<{ n: string }>("select count(*)::text as n from pos_lines_keep");
  if (Number(kept.rows[0]?.n ?? 0) > 0) {
    console.log(`Kassenpositionen übernommen: ${kept.rows[0]!.n}`);
  }
}
await client.query("commit");
await client.end();

console.log("Synthetic seed complete.");
console.log("Password for the role fixtures: Synthetic-Staff-1");
console.log("Local admin: user@example.test / password");
console.log("Masulino Spielwelt / Äppelallee: owner.masulino@example.test, it.masulino@example.test, manager.masulino@example.test, reception.masulino@example.test, employee.masulino@example.test");
console.log("Revoked login: revoked.masulino@example.test");
