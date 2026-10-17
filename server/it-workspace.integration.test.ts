import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { inviteStaff, suspendMembership } from "@masulino/core";
import { closePools, getPool, rows, withTenant } from "@masulino/database";
import { addClosure, updatePackageRecord } from "@masulino/reservations";
import type { ActorContext } from "@masulino/core";
import { admin, lockFixture, reset, seed, staff, unlockFixture, type Fixture } from "./test/fixture";

function itActor(fixture: Fixture): ActorContext {
  return {
    ...staff(fixture),
    grants: [{ roleKey: "it", locationId: null }],
    mfaSatisfied: true,
  };
}

describe.sequential("IT invite permission and catalog write", () => {
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

  it("lets IT invite reception and refuses reception invites and owner grants", async () => {
    const fixture = await seed();
    await expect(
      inviteStaff(
        staff(fixture),
        { email: "new.reception@example.test", roleKey: "reception", locationId: fixture.locationA },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "forbidden" });

    const created = await inviteStaff(
      itActor(fixture),
      { email: "new.reception@example.test", roleKey: "reception", locationId: fixture.locationA },
      randomUUID(),
    );
    expect(created.acceptPath).toContain("token=");
    expect(created.acceptPath).not.toContain("Synthetic");

    await expect(
      inviteStaff(
        itActor(fixture),
        { email: "owner.try@example.test", roleKey: "tenant_owner", locationId: null },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "forbidden", message: "grant_outside_authority" });

    const invitations = await withTenant(fixture.tenantA, async (tx) =>
      rows<{ email: string; role_key: string }>(
        tx,
        sql`select email, role_key from staff_invitations order by created_at`,
      ),
    );
    expect(invitations).toEqual([{ email: "new.reception@example.test", role_key: "reception" }]);

    const audits = await withTenant(fixture.tenantA, async (tx) =>
      rows<{ changes: { email?: string; roleKey?: string } | string }>(
        tx,
        sql`select changes from audit_events where action = 'core.users.invite'`,
      ),
    );
    const changes = typeof audits[0]?.changes === "string" ? JSON.parse(audits[0].changes) : audits[0]?.changes;
    expect(changes).toMatchObject({ email: "[redacted]", roleKey: "reception" });
  });

  it("lets IT change a package price and add a closure, and keeps audit rows append-only", async () => {
    const fixture = await seed();
    await expect(
      updatePackageRecord({
        actor: staff(fixture),
        input: {
          locationId: fixture.locationA,
          packageId: fixture.packageId,
          publicCode: "comfort",
          priceMinor: 11100,
          durationMinutes: 90,
          status: "active",
        },
        correlationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    await updatePackageRecord({
      actor: itActor(fixture),
      input: {
        locationId: fixture.locationA,
        packageId: fixture.packageId,
        publicCode: "comfort",
        priceMinor: 22200,
        durationMinutes: 90,
        status: "active",
      },
      correlationId: randomUUID(),
    });
    const closure = await addClosure({
      actor: itActor(fixture),
      input: {
        locationId: fixture.locationA,
        startsOn: "2026-12-24",
        endsOn: "2026-12-26",
        reason: "Betriebsferien",
      },
      correlationId: randomUUID(),
    });
    expect(closure.id).toBeTruthy();

    const stored = await withTenant(fixture.tenantA, async (tx) =>
      rows<{ price_minor: number; public_code: string; reason: string }>(
        tx,
        sql`
          select p.price_minor, p.public_code, c.reason
          from packages p
          join closures c on c.location_id = p.location_id
          where p.id = ${fixture.packageId}
        `,
      ),
    );
    expect(stored[0]).toMatchObject({ price_minor: 22200, public_code: "comfort", reason: "Betriebsferien" });

    const app = await getPool("app").connect();
    await expect(app.query("delete from audit_events")).rejects.toThrow();
    app.release();

    const owner = await admin();
    await expect(owner.query("delete from audit_events")).rejects.toThrow(/append-only/);
    await owner.end();
  });

  it("refuses to suspend the last active owner", async () => {
    const fixture = await seed();
    const client = await admin();
    const principalId = randomUUID();
    const membershipId = randomUUID();
    const receptionPrincipal = randomUUID();
    const receptionMembership = randomUUID();
    await client.query(
      `insert into principals (id, issuer, subject, email, display_name) values
        ($1, 'urn:masulino:better-auth', 'owner-subject', 'owner.it@example.test', 'Owner'),
        ($2, 'urn:masulino:better-auth', 'reception-subject', 'desk.it@example.test', 'Desk')`,
      [principalId, receptionPrincipal],
    );
    await client.query(
      `insert into memberships (id, tenant_id, principal_id, status) values
        ($1, $2, $3, 'active'),
        ($4, $2, $5, 'active')`,
      [membershipId, fixture.tenantA, principalId, receptionMembership, receptionPrincipal],
    );
    await client.query(
      `insert into grants (tenant_id, membership_id, role_key, location_id) values
        ($1, $2, 'tenant_owner', null),
        ($1, $3, 'reception', $4)`,
      [fixture.tenantA, membershipId, receptionMembership, fixture.locationA],
    );
    await client.end();

    await expect(
      suspendMembership({ actor: itActor(fixture), membershipId, correlationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "last_owner" });

    await suspendMembership({
      actor: itActor(fixture),
      membershipId: receptionMembership,
      correlationId: randomUUID(),
    });
    const statuses = await withTenant(fixture.tenantA, async (tx) =>
      rows<{ id: string; status: string }>(tx, sql`select id, status from memberships`),
    );
    expect(statuses.find((row) => row.id === membershipId)?.status).toBe("active");
    expect(statuses.find((row) => row.id === receptionMembership)?.status).toBe("suspended");
  });
});
