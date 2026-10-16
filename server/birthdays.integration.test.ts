import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { birthdayPackages } from "@masulino/contracts";
import { closePools, rows, withTenant } from "@masulino/database";
import { handleApiRequest } from "./src/api-entry";
import { admin, lockFixture, reset, seed, unlockFixture, type Fixture } from "./test/fixture";

const SITE_KEY = "local-dev-site-key-16";
const DATE = "2026-11-14";

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function addBirthdayPackages(fixture: Fixture) {
  const client = await admin();
  for (const pkg of birthdayPackages) {
    await client.query(
      `insert into packages (
        id, tenant_id, location_id, name, duration_minutes, price_minor, currency,
        min_children, max_children, public_code, fixture
      ) values ($1, $2, $3, $4, $5, $6, $7, 1, 40, $8, false)`,
      [
        randomUUID(),
        fixture.tenantA,
        fixture.locationA,
        pkg.name,
        pkg.durationMinutes,
        pkg.priceMinor,
        pkg.currency,
        pkg.code,
      ],
    );
  }
  await client.end();
}

function form(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: "birthday-form-key-1",
    date: DATE,
    time: "10:00",
    package: "comfort",
    childName: "Mia",
    childAge: 7,
    children: 8,
    adults: 4,
    adultFlatRate: true,
    givenName: "Anna",
    familyName: "Keller",
    email: "anna@example.test",
    phone: "015112345678",
    message: "Bitte einen Fensterplatz",
    referral: "instagram",
    ...overrides,
  };
}

describe.sequential("website birthday form", () => {
  let previousKey: string | undefined;
  let previousSlug: string | undefined;

  beforeEach(async () => {
    previousKey = process.env.MASULINO_SITE_KEY;
    previousSlug = process.env.MASULINO_PUBLIC_VENUE_SLUG;
    process.env.MASULINO_SITE_KEY = SITE_KEY;
    process.env.MASULINO_PUBLIC_VENUE_SLUG = "a-berlin";
    await lockFixture();
    await reset();
  });

  afterEach(async () => {
    restoreEnv("MASULINO_SITE_KEY", previousKey);
    restoreEnv("MASULINO_PUBLIC_VENUE_SLUG", previousSlug);
    await unlockFixture();
  });

  afterAll(async () => {
    await closePools();
  });

  it("lists open times and stores the form once", async () => {
    const fixture = await seed();
    await addBirthdayPackages(fixture);
    const headers = { authorization: `Bearer ${SITE_KEY}` };

    const timesResponse = await handleApiRequest(
      new Request(`http://staff.test/api/public/birthdays/times?date=${DATE}&children=8&adults=4`, { headers }),
    );
    expect(timesResponse.status).toBe(200);
    const times = (await timesResponse.json()) as { closed: boolean; times: string[] };
    expect(times.closed).toBe(false);
    expect(times.times).toContain("10:00");
    expect(times.times).not.toContain("18:00");

    const createdResponse = await handleApiRequest(
      new Request("http://staff.test/api/public/birthdays", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(form()),
      }),
    );
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as {
      reference: string;
      package: string;
      pricePerChildMinor: number;
      adultFlatMinor: number;
      totalMinor: number;
      payment: string;
      replayed: boolean;
    };
    expect(created.replayed).toBe(false);
    expect(created.package).toBe("comfort");
    expect(created.pricePerChildMinor).toBe(1480);
    expect(created.adultFlatMinor).toBe(1000);
    expect(created.totalMinor).toBe(8 * 1480 + 1000);
    expect(created.payment).toBe("on_site");

    const stored = await withTenant(fixture.tenantA, async (tx) =>
      rows<{
        honoree_first_name: string;
        honoree_age: number;
        organizer_given_name: string;
        organizer_family_name: string;
        organizer_name: string;
        organizer_email: string;
        children_count: number;
        adult_count: number;
        adult_flat_rate: boolean;
        adult_flat_unit_minor: number;
        referral_source: string;
        source_channel: string;
        notes: string;
        status: string;
      }>(
        tx,
        sql`
          select honoree_first_name, honoree_age, organizer_given_name, organizer_family_name,
                 organizer_name, organizer_email, children_count, adult_count, adult_flat_rate,
                 adult_flat_unit_minor, referral_source, source_channel, notes, status
          from reservations
          where reference = ${created.reference}
        `,
      ),
    );
    expect(stored).toEqual([
      {
        honoree_first_name: "Mia",
        honoree_age: 7,
        organizer_given_name: "Anna",
        organizer_family_name: "Keller",
        organizer_name: "Anna Keller",
        organizer_email: "anna@example.test",
        children_count: 8,
        adult_count: 4,
        adult_flat_rate: true,
        adult_flat_unit_minor: 250,
        referral_source: "instagram",
        source_channel: "guest_web",
        notes: "Bitte einen Fensterplatz",
        status: "confirmed",
      },
    ]);
    const payments = await withTenant(fixture.tenantA, async (tx) => rows(tx, sql`select id from financial_facts`));
    expect(payments).toEqual([]);

    const replayResponse = await handleApiRequest(
      new Request("http://staff.test/api/public/birthdays", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(form()),
      }),
    );
    expect(replayResponse.status).toBe(200);
    const replay = (await replayResponse.json()) as { reference: string; replayed: boolean };
    expect(replay.replayed).toBe(true);
    expect(replay.reference).toBe(created.reference);

    const changed = await handleApiRequest(
      new Request("http://staff.test/api/public/birthdays", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(form({ childName: "Lea" })),
      }),
    );
    expect(changed.status).toBe(400);
    expect(await changed.json()).toMatchObject({ error: "idempotency_mismatch" });

    const after = await handleApiRequest(
      new Request(`http://staff.test/api/public/birthdays/times?date=${DATE}&children=8&adults=4`, { headers }),
    );
    const later = (await after.json()) as { times: string[] };
    expect(later.times).not.toContain("10:00");
  });
});
