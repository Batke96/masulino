import { birthdayPackages } from "@masulino/contracts";
import { rows, withTenant } from "@masulino/database";
import { sql } from "drizzle-orm";
import { tableSeats } from "../../lib/booking/tables";
import { startsWithin, windowsFor } from "../../lib/booking/slots";
import { exampleBookings } from "../../lib/tagesmappe/folder";

/**
 * The hosted workplace at masulino-rho.vercel.app is the bootstrapped
 * tenant `masulino` / `hauptstandort`. It has no Spielwelt seed, and
 * `pnpm db:demo-seed` refuses to write once that owner exists.
 * Staff reads then have nothing to render. This fills the floor, the
 * two birthday packages and the three Tagesmappe parties for that
 * location only. Other tenants are left alone.
 */

const hostedTenant = "masulino";
const hostedLocation = "hauptstandort";

const contacts: Record<string, { email: string; phone: string }> = {
  "B-1024": { email: "mueller.fixture@example.test", phone: "030001024" },
  "B-1025": { email: "schmidt.fixture@example.test", phone: "030001025" },
  "B-1026": { email: "weber.fixture@example.test", phone: "030001026" },
};

const note = "Beispiel aus der Tagesmappe vom 29.10.2026. Keine echten Gäste.";

const openingHours = {
  mon: { startMinute: 600, endMinute: 1080 },
  tue: { startMinute: 600, endMinute: 1080 },
  wed: { startMinute: 600, endMinute: 1080 },
  thu: { startMinute: 600, endMinute: 1080 },
  fri: { startMinute: 600, endMinute: 1080 },
  sat: { startMinute: 600, endMinute: 1080 },
  sun: { startMinute: 600, endMinute: 1080 },
};

export async function ensureHostedDemoParties(scope: {
  tenantId: string;
  tenantSlug: string;
  locationId: string;
  locationSlug: string;
  timezone: string;
  principalId: string;
}): Promise<void> {
  if (scope.tenantSlug !== hostedTenant || scope.locationSlug !== hostedLocation) return;
  await ensureMockParties(scope);
}

export async function ensureMockParties(scope: {
  tenantId: string;
  locationId: string;
  timezone: string;
  principalId: string;
}): Promise<void> {
  await withTenant(scope.tenantId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${scope.tenantId}:${scope.locationId}`}))`);
    const dayRow = await rows<{ day: string }>(
      tx,
      sql`select (timezone(${scope.timezone}, now()))::date::text as day`,
    );
    const day = dayRow[0]?.day;
    if (!day) throw new Error("Could not read the venue date.");

    const present = await rows<{ reference: string; day: string; email: string; table_name: string | null }>(
      tx,
      sql`
        select r.reference, r.local_date::text as day, r.organizer_email as email, res.name as table_name
        from reservations r
        left join allocations a on a.tenant_id = r.tenant_id and a.reservation_id = r.id
        left join resources res on res.id = a.resource_id
        where r.location_id = ${scope.locationId}
          and r.reference in ('B-1024', 'B-1025', 'B-1026')
      `,
    );
    const ready = new Map(present.map((row) => [row.reference, row]));
    const current = exampleBookings.every((booking) => {
      const row = ready.get(booking.reference);
      return (
        row &&
        row.day === day &&
        row.email.endsWith("@example.test") &&
        row.table_name === booking.tables[0]
      );
    });
    if (current) return;

    const tables = new Map<string, { resourceId: string; combinationId: string }>();
    for (const seat of tableSeats) {
      const name = `Tisch ${seat.id}`;
      tables.set(name, await ensureTable(tx, scope, name, seat.seats));
    }

    const packages = new Map<string, { id: string; name: string; priceMinor: number; currency: string }>();
    for (const pkg of birthdayPackages) {
      packages.set(pkg.code, await ensurePackage(tx, scope, pkg));
    }

    const rule = await ensureRule(tx, scope);

    for (const booking of exampleBookings) {
      const contact = contacts[booking.reference];
      const table = tables.get(booking.tables[0] ?? "");
      const code = /deluxe/i.test(booking.packageName) ? "deluxe" : "comfort";
      const pkg = packages.get(code);
      if (!contact || !table || !pkg) throw new Error(`Incomplete mock party ${booking.reference}.`);
      const window = windowsFor(day, "birthday").find((item) => startsWithin(booking.time, item));
      const end = window?.end ?? "19:00";
      await upsertParty(tx, scope, {
        reference: booking.reference,
        name: booking.name,
        email: contact.email,
        phone: contact.phone,
        day,
        start: booking.time,
        end,
        before: shift(booking.time, -30),
        after: shift(end, 30),
        children: booking.children,
        adults: booking.adults,
        packageId: pkg.id,
        packageName: pkg.name,
        priceMinor: pkg.priceMinor,
        currency: pkg.currency,
        ruleId: rule.id,
        ruleVersion: rule.version,
        combinationId: table.combinationId,
        resourceId: table.resourceId,
      });
    }
  });
}

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

async function ensureTable(
  tx: Tx,
  scope: { tenantId: string; locationId: string },
  name: string,
  seats: number,
): Promise<{ resourceId: string; combinationId: string }> {
  const existing = await rows<{ resource_id: string; combination_id: string | null }>(
    tx,
    sql`
      select r.id as resource_id, cr.combination_id
      from resources r
      left join combination_resources cr on cr.tenant_id = r.tenant_id and cr.resource_id = r.id
      where r.tenant_id = ${scope.tenantId} and r.location_id = ${scope.locationId} and r.name = ${name}
      limit 1
    `,
  );
  let resourceId = existing[0]?.resource_id;
  if (!resourceId) {
    const inserted = await rows<{ id: string }>(
      tx,
      sql`
        insert into resources (tenant_id, location_id, name, capacity_children)
        values (${scope.tenantId}, ${scope.locationId}, ${name}, ${seats})
        returning id
      `,
    );
    resourceId = inserted[0]?.id;
  }
  if (!resourceId) throw new Error(`Could not store ${name}.`);
  let combinationId = existing[0]?.combination_id ?? undefined;
  if (!combinationId) {
    const inserted = await rows<{ id: string }>(
      tx,
      sql`
        insert into combinations (tenant_id, location_id, name, min_children, max_children, max_adults)
        values (${scope.tenantId}, ${scope.locationId}, ${name}, 1, ${seats}, 40)
        returning id
      `,
    );
    combinationId = inserted[0]?.id;
    if (!combinationId) throw new Error(`Could not store a combination for ${name}.`);
    await tx.execute(sql`
      insert into combination_resources (tenant_id, combination_id, resource_id)
      values (${scope.tenantId}, ${combinationId}, ${resourceId})
    `);
  }
  return { resourceId, combinationId };
}

async function ensurePackage(
  tx: Tx,
  scope: { tenantId: string; locationId: string },
  pkg: (typeof birthdayPackages)[number],
): Promise<{ id: string; name: string; priceMinor: number; currency: string }> {
  const existing = await rows<{ id: string; name: string; price_minor: number; currency: string }>(
    tx,
    sql`
      select id, name, price_minor, currency
      from packages
      where tenant_id = ${scope.tenantId}
        and location_id = ${scope.locationId}
        and public_code = ${pkg.code}
      limit 1
    `,
  );
  const found = existing[0];
  if (found) {
    return { id: found.id, name: found.name, priceMinor: found.price_minor, currency: String(found.currency).trim() };
  }
  const inserted = await rows<{ id: string }>(
    tx,
    sql`
      insert into packages (
        tenant_id, location_id, name, duration_minutes, price_minor, currency,
        min_children, max_children, public_code, fixture
      ) values (
        ${scope.tenantId}, ${scope.locationId}, ${pkg.name}, ${pkg.durationMinutes}, ${pkg.priceMinor}, ${pkg.currency},
        1, 40, ${pkg.code}, false
      )
      returning id
    `,
  );
  const id = inserted[0]?.id;
  if (!id) throw new Error(`Could not store package ${pkg.code}.`);
  return { id, name: pkg.name, priceMinor: pkg.priceMinor, currency: pkg.currency };
}

async function ensureRule(
  tx: Tx,
  scope: { tenantId: string; locationId: string; timezone: string },
): Promise<{ id: string; version: number }> {
  const existing = await rows<{ id: string; version: number }>(
    tx,
    sql`
      select id, version from venue_rules
      where tenant_id = ${scope.tenantId} and location_id = ${scope.locationId} and status = 'published'
      order by version desc
      limit 1
    `,
  );
  if (existing[0]) return existing[0];
  const inserted = await rows<{ id: string; version: number }>(
    tx,
    sql`
      insert into venue_rules (
        tenant_id, location_id, version, status, timezone, buffer_before_minutes, buffer_after_minutes,
        slot_minutes, horizon_days, opening_hours, adult_seating, fixture, published_at
      ) values (
        ${scope.tenantId}, ${scope.locationId}, 1, 'published', ${scope.timezone}, 30, 30,
        30, 90, ${JSON.stringify(openingHours)}::jsonb, 'not_required', true, now()
      )
      returning id, version
    `,
  );
  const rule = inserted[0];
  if (!rule) throw new Error("Could not store the venue rule.");
  return rule;
}

async function upsertParty(
  tx: Tx,
  scope: { tenantId: string; locationId: string; principalId: string },
  party: {
    reference: string;
    name: string;
    email: string;
    phone: string;
    day: string;
    start: string;
    end: string;
    before: string;
    after: string;
    children: number;
    adults: number;
    packageId: string;
    packageName: string;
    priceMinor: number;
    currency: string;
    ruleId: string;
    ruleVersion: number;
    combinationId: string;
    resourceId: string;
  },
): Promise<void> {
  const existing = await rows<{ id: string; email: string }>(
    tx,
    sql`
      select id, organizer_email as email
      from reservations
      where tenant_id = ${scope.tenantId} and reference = ${party.reference}
    `,
  );
  const prior = existing[0];
  if (prior && !prior.email.endsWith("@example.test")) return;

  const starts = sql`(${party.day}::date + ${party.start}::time) at time zone 'Europe/Berlin'`;
  const ends = sql`(${party.day}::date + ${party.end}::time) at time zone 'Europe/Berlin'`;
  let reservationId = prior?.id;
  if (!reservationId) {
    const inserted = await rows<{ id: string }>(
      tx,
      sql`
        insert into reservations (
          tenant_id, location_id, reference, status, organizer_name, organizer_email, organizer_phone,
          starts_at, ends_at, local_date, children_count, adult_count, package_id, package_name_snapshot,
          price_minor_snapshot, currency_snapshot, rule_id, rule_version_snapshot, combination_id,
          source_channel, notes, created_by_principal_id
        ) values (
          ${scope.tenantId}, ${scope.locationId}, ${party.reference}, 'confirmed', ${party.name}, ${party.email}, ${party.phone},
          ${starts}, ${ends}, ${party.day}::date, ${party.children}, ${party.adults}, ${party.packageId}, ${party.packageName},
          ${party.priceMinor}, ${party.currency}, ${party.ruleId}, ${party.ruleVersion}, ${party.combinationId},
          'staff_phone', ${note}, ${scope.principalId}
        )
        returning id
      `,
    );
    reservationId = inserted[0]?.id;
  } else {
    await tx.execute(sql`
      update reservations set
        location_id = ${scope.locationId},
        organizer_name = ${party.name},
        organizer_email = ${party.email},
        organizer_phone = ${party.phone},
        starts_at = ${starts},
        ends_at = ${ends},
        local_date = ${party.day}::date,
        children_count = ${party.children},
        adult_count = ${party.adults},
        package_id = ${party.packageId},
        package_name_snapshot = ${party.packageName},
        price_minor_snapshot = ${party.priceMinor},
        currency_snapshot = ${party.currency},
        rule_id = ${party.ruleId},
        rule_version_snapshot = ${party.ruleVersion},
        combination_id = ${party.combinationId},
        notes = ${note},
        status = 'confirmed',
        updated_at = now()
      where tenant_id = ${scope.tenantId} and id = ${reservationId} and reference = ${party.reference}
    `);
  }
  if (!reservationId) throw new Error(`Could not store ${party.reference}.`);
  await tx.execute(sql`
    delete from allocations where tenant_id = ${scope.tenantId} and reservation_id = ${reservationId}
  `);
  await tx.execute(sql`
    insert into allocations (tenant_id, location_id, reservation_id, resource_id, occupancy)
    values (
      ${scope.tenantId}, ${scope.locationId}, ${reservationId}, ${party.resourceId},
      tstzrange(
        (${party.day}::date + ${party.before}::time) at time zone 'Europe/Berlin',
        (${party.day}::date + ${party.after}::time) at time zone 'Europe/Berlin',
        '[)'
      )
    )
  `);
}

function shift(time: string, minutes: number): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new Error(`Bad time ${time}`);
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  if (hour < 0 || hour > 23 || minute < 0) throw new Error(`Time ${time} shifted by ${minutes} leaves the day.`);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
