import type { Client } from "pg";
import { startsWithin, windowsFor } from "../lib/booking/slots.ts";
import { exampleBookings } from "../lib/tagesmappe/folder.ts";

/**
 * The co-founder's Tagesmappe parties (Familie Müller, Schmidt, Weber).
 * Signed-in screens read Postgres, so these rows are what Buchungen,
 * the floor plan and the Tagesmappe show. The date is the Berlin day of
 * this run, which is the day the workplace opens on.
 * Only @example.test addresses are written or updated.
 */

const contacts: Record<string, { email: string; phone: string }> = {
  "B-1024": { email: "mueller.fixture@example.test", phone: "030001024" },
  "B-1025": { email: "schmidt.fixture@example.test", phone: "030001025" },
  "B-1026": { email: "weber.fixture@example.test", phone: "030001026" },
};

const note = "Beispiel aus der Tagesmappe vom 29.10.2026. Keine echten Gäste.";

export type ExamplePartyResult = {
  day: string;
  inserted: string[];
  updated: string[];
  skipped: string[];
};

export async function ensureExampleParties(client: Client): Promise<ExamplePartyResult> {
  const place = await client.query<{ tenant_id: string; location_id: string }>(
    `select t.id as tenant_id, l.id as location_id
     from tenants t
     join locations l on l.tenant_id = t.id
     where t.slug = 'masulino-spielwelt' and l.slug = 'aeppelallee-biebrich'
     limit 1`,
  );
  const home = place.rows[0];
  if (!home) throw new Error("Masulino Spielwelt / Äppelallee is not in this database.");

  const dayRow = await client.query<{ day: string }>(
    `select (timezone('Europe/Berlin', now()))::date::text as day`,
  );
  const day = dayRow.rows[0]?.day;
  if (!day) throw new Error("Could not read the Berlin date.");

  const packages = await client.query<{
    id: string;
    name: string;
    price_minor: number;
    currency: string;
    public_code: string;
  }>(
    `select id, name, price_minor, currency, public_code
     from packages
     where tenant_id = $1 and location_id = $2 and public_code in ('comfort', 'deluxe')`,
    [home.tenant_id, home.location_id],
  );
  const byCode = new Map(packages.rows.map((row) => [row.public_code, row]));
  if (!byCode.has("comfort") || !byCode.has("deluxe")) {
    throw new Error("Comfort and Deluxe packages are missing. Run the demo seed on an empty database first.");
  }

  const rule = await client.query<{ id: string; version: number }>(
    `select id, version from venue_rules
     where tenant_id = $1 and location_id = $2 and status = 'published'
     order by version desc
     limit 1`,
    [home.tenant_id, home.location_id],
  );
  const published = rule.rows[0];
  if (!published) throw new Error("No published venue rule for Äppelallee.");

  const actor = await client.query<{ id: string }>(
    `select p.id
     from principals p
     join memberships m on m.principal_id = p.id and m.tenant_id = $1
     where m.status = 'active' and p.email = 'reception.masulino@example.test'
     limit 1`,
    [home.tenant_id],
  );
  const actorId = actor.rows[0]?.id;
  if (!actorId) throw new Error("Reception principal is missing.");

  const result: ExamplePartyResult = { day, inserted: [], updated: [], skipped: [] };

  for (const booking of exampleBookings) {
    const contact = contacts[booking.reference];
    if (!contact) throw new Error(`No synthetic contact for ${booking.reference}.`);
    const code = /deluxe/i.test(booking.packageName) ? "deluxe" : /comfort/i.test(booking.packageName) ? "comfort" : "";
    const pkg = byCode.get(code);
    if (!pkg) throw new Error(`No package for ${booking.reference}.`);
    const tableName = booking.tables[0];
    if (!tableName) throw new Error(`No table for ${booking.reference}.`);
    const seat = await client.query<{ resource_id: string; combination_id: string }>(
      `select r.id as resource_id, c.id as combination_id
       from resources r
       join combination_resources cr on cr.tenant_id = r.tenant_id and cr.resource_id = r.id
       join combinations c on c.tenant_id = r.tenant_id and c.id = cr.combination_id
       where r.tenant_id = $1 and r.location_id = $2 and r.name = $3
       limit 1`,
      [home.tenant_id, home.location_id, tableName],
    );
    const table = seat.rows[0];
    if (!table) throw new Error(`Floor table ${tableName} is missing.`);

    const window = windowsFor(day, "birthday").find((item) => startsWithin(booking.time, item));
    const end = window?.end ?? "19:00";
    const before = shift(booking.time, -30);
    const after = shift(end, 30);

    const existing = await client.query<{ id: string; email: string }>(
      `select id, organizer_email as email
       from reservations
       where tenant_id = $1 and reference = $2`,
      [home.tenant_id, booking.reference],
    );
    const prior = existing.rows[0];
    if (prior && !prior.email.endsWith("@example.test")) {
      result.skipped.push(booking.reference);
      continue;
    }

    const currency = String(pkg.currency).trim();
    const party = [
      home.tenant_id,
      home.location_id,
      booking.reference,
      booking.name,
      contact.email,
      contact.phone,
      day,
      booking.time,
      end,
      booking.children,
      booking.adults,
      pkg.id,
      pkg.name,
      pkg.price_minor,
      currency,
      published.id,
      published.version,
      table.combination_id,
      note,
    ];

    let reservationId = prior?.id;
    if (!reservationId) {
      const inserted = await client.query<{ id: string }>(
        `insert into reservations (
           tenant_id, location_id, reference, status, organizer_name, organizer_email, organizer_phone,
           starts_at, ends_at, local_date, children_count, adult_count, package_id, package_name_snapshot,
           price_minor_snapshot, currency_snapshot, rule_id, rule_version_snapshot, combination_id,
           source_channel, notes, created_by_principal_id
         ) values (
           $1, $2, $3, 'confirmed', $4, $5, $6,
           ($7::date + $8::time) at time zone 'Europe/Berlin',
           ($7::date + $9::time) at time zone 'Europe/Berlin',
           $7::date, $10, $11, $12, $13, $14, $15, $16, $17, $18,
           'staff_phone', $19, $20
         )
         returning id`,
        [...party, actorId],
      );
      reservationId = inserted.rows[0]?.id;
      if (!reservationId) throw new Error(`Insert failed for ${booking.reference}.`);
      result.inserted.push(booking.reference);
    } else {
      await client.query(
        `update reservations set
           location_id = $2,
           organizer_name = $4,
           organizer_email = $5,
           organizer_phone = $6,
           starts_at = ($7::date + $8::time) at time zone 'Europe/Berlin',
           ends_at = ($7::date + $9::time) at time zone 'Europe/Berlin',
           local_date = $7::date,
           children_count = $10,
           adult_count = $11,
           package_id = $12,
           package_name_snapshot = $13,
           price_minor_snapshot = $14,
           currency_snapshot = $15,
           rule_id = $16,
           rule_version_snapshot = $17,
           combination_id = $18,
           notes = $19,
           status = 'confirmed',
           updated_at = now()
         where tenant_id = $1 and id = $20 and reference = $3`,
        [...party, reservationId],
      );
      result.updated.push(booking.reference);
    }

    await client.query(
      `delete from allocations where tenant_id = $1 and reservation_id = $2`,
      [home.tenant_id, reservationId],
    );
    await client.query(
      `insert into allocations (tenant_id, location_id, reservation_id, resource_id, occupancy)
       values ($1, $2, $3, $4, tstzrange(
         ($5::date + $6::time) at time zone 'Europe/Berlin',
         ($5::date + $7::time) at time zone 'Europe/Berlin',
         '[)'
       ))`,
      [home.tenant_id, home.location_id, reservationId, table.resource_id, day, before, after],
    );
  }

  return result;
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
