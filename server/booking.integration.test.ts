import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closePools, rows, withTenant } from "@masulino/database";
import { allocate, defaultPreparationTasks } from "@masulino/indoor-play";
import { createStaffBooking, dailyView } from "@masulino/reservations";
import { lockFixture, reset, seed, staff, unlockFixture } from "./test/fixture";

describe.sequential("tenant isolation and allocation", () => {
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

  it("hides tenant rows without context and across tenants", async () => {
    const fixture = await seed();
    await withTenant(fixture.tenantA, async (tx) => {
      await tx.execute(sql`
        insert into closures (tenant_id, location_id, starts_on, ends_on, reason)
        values (${fixture.tenantA}, ${fixture.locationA}, '2026-12-24', '2026-12-24', 'synthetic')
      `);
    });
    const { getAppDb } = await import("@masulino/database");
    const leaked = await getAppDb().transaction(async (tx) => rows<{ id: string }>(tx, sql`select id from closures`));
    expect(leaked).toEqual([]);
    const other = await withTenant(fixture.tenantB, async (tx) => rows(tx, sql`select id from closures`));
    expect(other).toEqual([]);
    const own = await withTenant(fixture.tenantA, async (tx) => rows(tx, sql`select id from closures`));
    expect(own).toHaveLength(1);
  });

  it("does not let the worker or auth role read reservations", async () => {
    const { getPool } = await import("@masulino/database");
    const worker = await getPool("worker").connect();
    await expect(worker.query("select * from reservations")).rejects.toThrow();
    worker.release();
    const auth = await getPool("auth").connect();
    await expect(auth.query("select * from reservations")).rejects.toThrow();
    auth.release();
  });

  it("confirms only one of two concurrent last-slot bookings", async () => {
    const fixture = await seed();
    const input = {
      locationId: fixture.locationA,
      localDate: "2026-06-15",
      localTime: "14:00",
      childrenCount: 8,
      adultCount: 2,
      packageId: fixture.packageId,
      organizerName: "Familie Test",
      organizerEmail: "guest@example.test",
      organizerPhone: "030123",
      sourceChannel: "staff_phone" as const,
      notes: "",
      mode: "confirm" as const,
    };
    const [first, second] = await Promise.all([
      createStaffBooking({
        actor: staff(fixture),
        input: { ...input, idempotencyKey: "slot-a-key" },
        correlationId: randomUUID(),
        allocate,
        preparationTasks: defaultPreparationTasks,
      }),
      createStaffBooking({
        actor: staff(fixture),
        input: { ...input, idempotencyKey: "slot-b-key", organizerEmail: "other@example.test" },
        correlationId: randomUUID(),
        allocate,
        preparationTasks: defaultPreparationTasks,
      }),
    ]);
    const results = [first, second];
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.code === "conflict")).toHaveLength(1);
    const allocations = await withTenant(fixture.tenantA, async (tx) => rows(tx, sql`select id from allocations`));
    expect(allocations).toHaveLength(1);
    const day = await dailyView({
      actor: staff(fixture),
      locationId: fixture.locationA,
      localDate: "2026-06-15",
    });
    expect(day.filter((row) => row.status === "confirmed")).toHaveLength(1);
    expect(day[0]?.tasks.some((task) => task.status === "open")).toBe(true);
  });

  it("replays an identical booking and rejects a reused key with a different payload", async () => {
    const fixture = await seed();
    const base = {
      actor: staff(fixture),
      correlationId: randomUUID(),
      allocate,
      preparationTasks: defaultPreparationTasks,
      input: {
        locationId: fixture.locationA,
        idempotencyKey: "same-key-0001",
        localDate: "2026-06-16",
        localTime: "11:00",
        childrenCount: 4,
        adultCount: 2,
        packageId: fixture.packageId,
        organizerName: "Familie Test",
        organizerEmail: "guest@example.test",
        organizerPhone: "030123",
        sourceChannel: "staff_phone" as const,
        notes: "",
        mode: "confirm" as const,
      },
    };
    const created = await createStaffBooking(base);
    const replay = await createStaffBooking(base);
    expect(created.ok && replay.ok && created.booking.id === replay.booking.id).toBe(true);
    await expect(
      createStaffBooking({
        ...base,
        input: { ...base.input, childrenCount: 5 },
      }),
    ).rejects.toMatchObject({ code: "idempotency_mismatch" });
  });
});
