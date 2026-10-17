import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { AppError } from "@masulino/contracts";
import { createStaffAccount, listStaffDirectory, removeStaffAccount, type ActorContext } from "@masulino/core";
import { closePools, getPool, rows, withTenant } from "@masulino/database";
import { getAuth } from "./src/auth";
import { staffCredentials } from "./src/staff-credentials";
import { admin, lockFixture, reset, seed, unlockFixture, type Fixture } from "./test/fixture";

const password = "Empfang-Pass-91";

type Actors = {
  fixture: Fixture;
  itActor: ActorContext;
  ownerActor: ActorContext;
  adminActor: ActorContext;
  ownerMembershipId: string;
};

function actor(fixture: Fixture, principalId: string, roleKey: ActorContext["grants"][number]["roleKey"]): ActorContext {
  return {
    principalId,
    tenantId: fixture.tenantA,
    membershipStatus: "active",
    grants: [{ roleKey, locationId: roleKey === "reception" ? fixture.locationA : null }],
    entitlements: { core: true, reservations: true, content: true },
    mfaSatisfied: true,
  };
}

async function directoryFixture(): Promise<Actors> {
  const fixture = await seed();
  const client = await admin();
  const itPrincipal = randomUUID();
  const ownerPrincipal = randomUUID();
  const adminPrincipal = randomUUID();
  const itMembership = randomUUID();
  const ownerMembership = randomUUID();
  const adminMembership = randomUUID();
  await client.query(
    `insert into principals (id, issuer, subject, email, display_name) values
      ($1, 'urn:masulino:better-auth', $2, 'it-actor@example.test', 'IT'),
      ($3, 'urn:masulino:better-auth', $4, 'owner-actor@example.test', 'Inhaber'),
      ($5, 'urn:masulino:better-auth', $6, 'admin-actor@example.test', 'Verwaltung')`,
    [itPrincipal, `subject-${itPrincipal}`, ownerPrincipal, `subject-${ownerPrincipal}`, adminPrincipal, `subject-${adminPrincipal}`],
  );
  await client.query(
    `insert into memberships (id, tenant_id, principal_id, status) values
      ($1, $2, $3, 'active'),
      ($4, $2, $5, 'active'),
      ($6, $2, $7, 'active')`,
    [itMembership, fixture.tenantA, itPrincipal, ownerMembership, ownerPrincipal, adminMembership, adminPrincipal],
  );
  await client.query(
    `insert into grants (tenant_id, membership_id, role_key, location_id) values
      ($1, $2, 'it', null),
      ($1, $3, 'tenant_owner', null),
      ($1, $4, 'tenant_administrator', null)`,
    [fixture.tenantA, itMembership, ownerMembership, adminMembership],
  );
  const rule = await client.query<{ id: string }>(`select id from venue_rules where tenant_id = $1 limit 1`, [
    fixture.tenantA,
  ]);
  await client.query(
    `insert into reservations (
      id, tenant_id, location_id, reference, status, organizer_name, organizer_email, organizer_phone,
      starts_at, ends_at, local_date, children_count, adult_count, package_id, package_name_snapshot,
      price_minor_snapshot, currency_snapshot, rule_id, rule_version_snapshot, source_channel
    ) values (
      $1, $2, $3, 'MS-KEEP-1', 'confirmed', 'Familie Bleibt', 'bleibt@example.test', '030123',
      (current_date::timestamp + time '14:00') at time zone 'Europe/Berlin',
      (current_date::timestamp + time '16:00') at time zone 'Europe/Berlin',
      (timezone('Europe/Berlin', now()))::date,
      4, 2, $4, 'Fixture', 10000, 'EUR', $5, 1, 'staff_phone'
    )`,
    [randomUUID(), fixture.tenantA, fixture.locationA, fixture.packageId, rule.rows[0]?.id],
  );
  await client.query(
    `insert into closures (tenant_id, location_id, starts_on, ends_on, reason)
     values ($1, $2, '2026-12-24', '2026-12-24', 'synthetic')`,
    [fixture.tenantA, fixture.locationA],
  );
  await client.end();
  return {
    fixture,
    itActor: actor(fixture, itPrincipal, "it"),
    ownerActor: actor(fixture, ownerPrincipal, "tenant_owner"),
    adminActor: actor(fixture, adminPrincipal, "tenant_administrator"),
    ownerMembershipId: ownerMembership,
  };
}

async function signIn(email: string, secret: string): Promise<Response> {
  return getAuth().handler(
    new Request("http://localhost:5173/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:5173",
      },
      body: JSON.stringify({ email, password: secret }),
    }),
  );
}

async function counts(tenantId: string) {
  return withTenant(tenantId, async (tx) =>
    rows<{ reservations: number; closures: number; packages: number; audits: number }>(
      tx,
      sql`
        select
          (select count(*)::int from reservations) as reservations,
          (select count(*)::int from closures) as closures,
          (select count(*)::int from packages) as packages,
          (select count(*)::int from audit_events) as audits
      `,
    ),
  );
}

describe.sequential("staff account create and remove", () => {
  beforeEach(async () => {
    await lockFixture();
    await reset();
  });

  afterEach(async () => {
    await unlockFixture();
  });

  afterAll(async () => {
    await closePools();
  });

  it("creates a reception login inside the tenant and removes it without erasing bookings", async () => {
    const { fixture, itActor, adminActor } = await directoryFixture();
    const appRole = await withTenant(fixture.tenantA, async (tx) =>
      rows<{ role_name: string }>(tx, sql`select current_user as role_name`),
    );
    expect(appRole[0]?.role_name).toBe("masulino_app");
    const auth = await getPool("auth").connect();
    const authRole = await auth.query<{ role_name: string }>("select current_user as role_name");
    expect(authRole.rows[0]?.role_name).toBe("masulino_auth");
    auth.release();

    const email = `empfang-${randomUUID()}@example.test`;
    await expect(
      createStaffAccount(
        itActor,
        { name: "Inhaber Versuch", email: `owner-${randomUUID()}@example.test`, roleKey: "tenant_owner", locationId: null, password },
        randomUUID(),
        staffCredentials,
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      createStaffAccount(
        itActor,
        {
          name: "Verwaltung Standort",
          email: `verwaltung-${randomUUID()}@example.test`,
          roleKey: "tenant_administrator",
          locationId: fixture.locationA,
          password,
        },
        randomUUID(),
        staffCredentials,
      ),
    ).rejects.toMatchObject({ code: "validation", message: "location_not_allowed" });
    await expect(
      createStaffAccount(
        itActor,
        { name: "Ohne Standort", email: `ohne-${randomUUID()}@example.test`, roleKey: "reception", locationId: null, password },
        randomUUID(),
        staffCredentials,
      ),
    ).rejects.toMatchObject({ code: "validation", message: "location_required" });
    await expect(
      createStaffAccount(
        adminActor,
        {
          name: "Leitung",
          email: `leitung-${randomUUID()}@example.test`,
          roleKey: "location_manager",
          locationId: fixture.locationA,
          password,
        },
        randomUUID(),
        staffCredentials,
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      createStaffAccount(
        itActor,
        { name: "Kurz", email: `kurz-${randomUUID()}@example.test`, roleKey: "reception", locationId: fixture.locationA, password: "short-pass" },
        randomUUID(),
        staffCredentials,
      ),
    ).rejects.toBeInstanceOf(AppError);

    const before = await counts(fixture.tenantA);
    const created = await createStaffAccount(
      itActor,
      { name: "Nora Empfang", email, roleKey: "reception", locationId: fixture.locationA, password },
      randomUUID(),
      staffCredentials,
    );
    expect(created.email).toBe(email);

    const { getAppDb } = await import("@masulino/database");
    const hidden = await getAppDb().transaction(async (tx) => rows<{ id: string }>(tx, sql`select id from memberships`));
    expect(hidden).toEqual([]);

    const visible = await withTenant(fixture.tenantA, async (tx) =>
      rows<{ subject: string; status: string }>(
        tx,
        sql`
          select p.subject, m.status
          from memberships m
          join principals p on p.id = m.principal_id
          where m.id = ${created.membershipId}
        `,
      ),
    );
    expect(visible[0]?.status).toBe("active");
    const subject = visible[0]?.subject ?? "";
    const stored = await getPool("auth").connect();
    const account = await stored.query<{ password: string | null }>(
      `select password from identity.account where user_id = $1 and provider_id = 'credential'`,
      [subject],
    );
    stored.release();
    const hash = account.rows[0]?.password ?? "";
    expect(hash).not.toBe("");
    expect(hash).not.toContain(password);
    const context = await getAuth().$context;
    expect(await context.password.verify({ hash, password })).toBe(true);

    const audit = await withTenant(fixture.tenantA, async (tx) =>
      rows<{ action: string; changes: string }>(
        tx,
        sql`select action, changes::text as changes from audit_events order by created_at`,
      ),
    );
    expect(audit.some((row) => row.action === "core.users.create")).toBe(true);
    const createRow = audit.find((row) => row.action === "core.users.create");
    expect(createRow?.changes).toContain("[redacted]");
    expect(createRow?.changes).not.toContain(password);
    expect(createRow?.changes).not.toContain(email);

    const signedIn = await signIn(email, password);
    await signedIn.text();
    expect(signedIn.status).toBe(200);

    const directory = await listStaffDirectory(itActor);
    const person = directory.people.find((item) => item.email === email);
    expect(person?.roleKey).toBe("reception");
    expect(person?.removable).toBe(true);
    expect(directory.roles.map((role) => role.roleKey)).not.toContain("tenant_owner");
    expect(directory.people.find((item) => item.roleKey === "tenant_owner")?.removable).toBe(false);

    await removeStaffAccount(itActor, created.membershipId, randomUUID(), staffCredentials);
    const afterSignIn = await signIn(email, password);
    await afterSignIn.text();
    expect(afterSignIn.ok).toBe(false);

    const after = await counts(fixture.tenantA);
    expect(after[0]?.reservations).toBe(before[0]?.reservations);
    expect(after[0]?.closures).toBe(before[0]?.closures);
    expect(after[0]?.packages).toBe(before[0]?.packages);
    expect((after[0]?.audits ?? 0) > (before[0]?.audits ?? 0)).toBe(true);
    const remaining = await withTenant(fixture.tenantA, async (tx) =>
      rows<{ status: string; reference: string | null }>(
        tx,
        sql`
          select m.status, r.reference
          from memberships m
          left join reservations r on r.reference = 'MS-KEEP-1'
          where m.id = ${created.membershipId}
        `,
      ),
    );
    expect(remaining[0]?.status).toBe("revoked");
    expect(remaining.some((row) => row.reference === "MS-KEEP-1")).toBe(true);
    const gone = await getPool("auth").connect();
    const user = await gone.query(`select id from identity."user" where email = $1`, [email]);
    gone.release();
    expect(user.rowCount).toBe(0);
    const listed = await listStaffDirectory(itActor);
    expect(listed.people.some((item) => item.email === email)).toBe(false);
  });

  it("rejects removing an owner and the last owner", async () => {
    const { itActor, ownerActor, ownerMembershipId, fixture } = await directoryFixture();
    await expect(removeStaffAccount(itActor, ownerMembershipId, randomUUID(), staffCredentials)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      removeStaffAccount(ownerActor, ownerMembershipId, randomUUID(), staffCredentials),
    ).rejects.toMatchObject({ code: "last_owner" });
    const still = await withTenant(fixture.tenantA, async (tx) =>
      rows<{ status: string }>(tx, sql`select status from memberships where id = ${ownerMembershipId}`),
    );
    expect(still[0]?.status).toBe("active");
  });
});
