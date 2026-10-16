import { randomBytes, randomUUID } from "node:crypto";
import {
  AppError,
  adultFlatRateMinor,
  isAppError,
  type AllocationInput,
  type AllocationResult,
  type AlternativeSlot,
  type CreateBookingInput,
} from "@masulino/contracts";
import { insertAudit, requirePermission, type ActorContext } from "@masulino/core";
import { pgCode, rows, withTenant } from "@masulino/database";
import { sql } from "drizzle-orm";
import { issueExchangeToken } from "./access";
import {
  allocationInput,
  assertModuleEnabled,
  assertPublishedVenue,
  bumpRate,
  hashPayload,
  loadBookingContext,
  readBooking,
  suggest,
} from "./context";
import { enqueueCancellation, enqueueConfirmationAndReminder, invalidateQueuedReminders } from "./delivery";
import { minutesOfDay, parseVenueLocal } from "./time";
import { DateTime } from "luxon";

type Allocate = (input: AllocationInput) => AllocationResult;

export type GuestCaller = {
  kind: "guest";
  tenantId: string;
  locationId: string;
  capabilityId: string;
};

type BookingCaller = { kind: "staff"; actor: ActorContext } | GuestCaller;

export type BookingResult =
  | {
      ok: true;
      replayed: boolean;
      booking: {
        id: string;
        reference: string;
        status: string;
        version: number;
        localDate: string;
        localTime: string;
        locationId: string;
        exchangeToken?: string;
      };
    }
  | { ok: false; code: "conflict"; alternatives: AlternativeSlot[] };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function tenantOf(caller: BookingCaller): string {
  return caller.kind === "staff" ? caller.actor.tenantId : caller.tenantId;
}

function actorKey(caller: BookingCaller): string {
  return caller.kind === "staff" ? `principal:${caller.actor.principalId}` : `guest:${caller.capabilityId}`;
}

export async function createStaffBooking(args: {
  actor: ActorContext;
  input: CreateBookingInput;
  correlationId: string;
  allocate: Allocate;
  preparationTasks: () => string[];
}): Promise<BookingResult> {
  requirePermission(args.actor, "reservations.booking.create", args.input.locationId);
  return createReservation({ ...args, caller: { kind: "staff", actor: args.actor } });
}

export async function createGuestBooking(args: {
  caller: GuestCaller;
  input: CreateBookingInput;
  correlationId: string;
  allocate: Allocate;
  preparationTasks: () => string[];
  createLimit?: number;
}): Promise<BookingResult> {
  if (!UUID.test(args.caller.capabilityId)) throw new AppError("validation", "capability");
  if (args.input.locationId !== args.caller.locationId) throw new AppError("forbidden", "location");
  if (args.input.sourceChannel !== "guest_web" || args.input.mode !== "confirm") {
    throw new AppError("validation", "guest_channel");
  }
  return createReservation({
    caller: args.caller,
    input: args.input,
    correlationId: args.correlationId,
    allocate: args.allocate,
    preparationTasks: args.preparationTasks,
    guestCreateLimit: args.createLimit ?? 10,
  });
}

async function createReservation(args: {
  caller: BookingCaller;
  input: CreateBookingInput;
  correlationId: string;
  allocate: Allocate;
  preparationTasks: () => string[];
  guestCreateLimit?: number;
}): Promise<BookingResult> {
  const tenantId = tenantOf(args.caller);
  const payloadHash = hashPayload(args.input);
  const principalId = args.caller.kind === "staff" ? args.caller.actor.principalId : null;
  try {
    return await withTenant(tenantId, async (tx) => {
      const existing = await rows<{ payload_hash: string; reservation_id: string | null }>(
        tx,
        sql`
          select payload_hash, reservation_id from idempotency_keys
          where actor_key = ${actorKey(args.caller)}
            and idempotency_key = ${args.input.idempotencyKey}
        `,
      );
      if (existing[0]) {
        if (existing[0].payload_hash !== payloadHash) {
          throw new AppError("idempotency_mismatch", "idempotency_mismatch");
        }
        const prior = await readBooking(tx, existing[0].reservation_id);
        if (!prior) throw new AppError("not_found", "reservation");
        return { ok: true as const, replayed: true, booking: prior };
      }
      if (args.caller.kind === "guest") {
        await assertModuleEnabled(tx, "reservations");
        await assertPublishedVenue(tx, args.input.locationId);
        await bumpRate(tx, tenantId, `guest-booking:${args.caller.capabilityId}`, args.guestCreateLimit ?? 10);
      } else {
        await bumpRate(tx, tenantId, `booking:${args.caller.actor.principalId}`, 30);
      }
      const loaded = await loadBookingContext(tx, args.input.locationId, args.input.packageId, args.input.localDate);
      if (args.input.childrenCount < loaded.pkg.minChildren || args.input.childrenCount > loaded.pkg.maxChildren) {
        throw new AppError("validation", "party_size");
      }
      const start = parseVenueLocal(args.input.localDate, args.input.localTime, loaded.rule.timezone);
      const end = start.plus({ minutes: loaded.pkg.durationMinutes });
      if (end.toISODate() !== start.toISODate()) {
        throw new AppError("validation", "cross_midnight");
      }
      const startMinute = minutesOfDay(start);
      const endMinute = minutesOfDay(end);
      let combinationId: string | null = null;
      let resourceIds: string[] = [];
      let occupancyStart: Date | null = null;
      let occupancyEnd: Date | null = null;
      const status = args.input.mode === "request" ? "requested" : "confirmed";
      if (args.input.mode === "confirm") {
        const decision = args.allocate(allocationInput(loaded, args.input, startMinute, endMinute, start, end));
        if (!decision.ok) {
          throw new AppError("conflict", "unavailable", {
            alternatives: suggest(loaded, args.input, args.allocate, startMinute),
          });
        }
        combinationId = decision.choice.combinationId;
        resourceIds = decision.choice.resourceIds;
        occupancyStart = decision.choice.occupancyStart;
        occupancyEnd = decision.choice.occupancyEnd;
      }
      const id = randomUUID();
      const reference = `MS-${randomBytes(5).toString("hex").toUpperCase()}`;
      const flatUnit = args.input.adultFlatRate ? adultFlatRateMinor : 0;
      const flatTotal = flatUnit * args.input.adultCount;
      await tx.execute(sql`
        insert into reservations (
          id, tenant_id, location_id, reference, status, organizer_name, organizer_email,
          organizer_phone, honoree_first_name, honoree_age, organizer_given_name, organizer_family_name,
          adult_flat_rate, adult_flat_unit_minor, adult_flat_total_minor, referral_source,
          starts_at, ends_at, local_date, children_count,
          adult_count, package_id, package_name_snapshot, price_minor_snapshot, currency_snapshot,
          rule_id, rule_version_snapshot, combination_id, source_channel, notes, version,
          created_by_principal_id
        ) values (
          ${id}, ${tenantId}, ${args.input.locationId}, ${reference}, ${status},
          ${args.input.organizerName}, ${args.input.organizerEmail}, ${args.input.organizerPhone},
          ${args.input.honoreeFirstName ?? null}, ${args.input.honoreeAge ?? null},
          ${args.input.organizerGivenName ?? null}, ${args.input.organizerFamilyName ?? null},
          ${flatUnit > 0}, ${flatUnit}, ${flatTotal}, ${args.input.referralSource ?? ""},
          ${start.toJSDate().toISOString()}::timestamptz,
          ${end.toJSDate().toISOString()}::timestamptz, ${args.input.localDate}::date,
          ${args.input.childrenCount}, ${args.input.adultCount}, ${loaded.pkg.id}, ${loaded.pkg.name},
          ${loaded.pkg.priceMinor}, ${loaded.pkg.currency}, ${loaded.rule.id}, ${loaded.rule.version},
          ${combinationId}, ${args.input.sourceChannel}, ${args.input.notes}, 1, ${principalId}
        )
      `);
      for (const resourceId of resourceIds) {
        await tx.execute(sql`
          insert into allocations (tenant_id, location_id, reservation_id, resource_id, occupancy)
          values (
            ${tenantId}, ${args.input.locationId}, ${id}, ${resourceId},
            tstzrange(${occupancyStart!.toISOString()}::timestamptz, ${occupancyEnd!.toISOString()}::timestamptz, '[)')
          )
        `);
      }
      if (status === "confirmed") {
        for (const title of args.preparationTasks()) {
          await tx.execute(sql`
            insert into reservation_tasks (tenant_id, location_id, reservation_id, title, status)
            values (${tenantId}, ${args.input.locationId}, ${id}, ${title}, 'open')
          `);
        }
        await enqueueConfirmationAndReminder(tx, {
          tenantId,
          locationId: args.input.locationId,
          reservationId: id,
          reference,
          version: 1,
          localDate: args.input.localDate,
          timezone: loaded.rule.timezone,
        });
      }
      let exchangeToken: string | undefined;
      if (args.caller.kind === "guest") {
        exchangeToken = await issueExchangeToken(tx, {
          tenantId,
          locationId: args.input.locationId,
          reservationId: id,
        });
      }
      await tx.execute(sql`
        insert into idempotency_keys (tenant_id, actor_key, idempotency_key, payload_hash, reservation_id)
        values (
          ${tenantId}, ${actorKey(args.caller)},
          ${args.input.idempotencyKey}, ${payloadHash}, ${id}
        )
      `);
      await insertAudit(tx, {
        tenantId,
        locationId: args.input.locationId,
        actorPrincipalId: principalId,
        action: status === "confirmed" ? "reservations.booking.confirm" : "reservations.booking.request",
        targetType: "reservation",
        targetId: id,
        outcome: "success",
        correlationId: args.correlationId,
        changes: {
          status,
          childrenCount: args.input.childrenCount,
          adultCount: args.input.adultCount,
          organizerEmail: args.input.organizerEmail,
          organizerPhone: args.input.organizerPhone,
          notes: args.input.notes,
          sourceChannel: args.input.sourceChannel,
        },
      });
      return {
        ok: true as const,
        replayed: false,
        booking: {
          id,
          reference,
          status,
          version: 1,
          localDate: args.input.localDate,
          localTime: args.input.localTime,
          locationId: args.input.locationId,
          exchangeToken,
        },
      };
    });
  } catch (error) {
    if (isAppError(error) && error.code === "conflict") {
      const details = error.details as { alternatives?: AlternativeSlot[] } | undefined;
      return { ok: false, code: "conflict", alternatives: details?.alternatives ?? [] };
    }
    if (pgCode(error) === "23P01") {
      const alternatives = await withTenant(tenantId, async (tx) => {
        const loaded = await loadBookingContext(tx, args.input.locationId, args.input.packageId, args.input.localDate);
        const start = parseVenueLocal(args.input.localDate, args.input.localTime, loaded.rule.timezone);
        return suggest(loaded, args.input, args.allocate, minutesOfDay(start));
      });
      return { ok: false, code: "conflict", alternatives };
    }
    throw error;
  }
}

export type BirthdayReceipt = {
  reference: string;
  date: string;
  time: string;
  package: string;
  children: number;
  adults: number;
  adultFlatRate: boolean;
  pricePerChildMinor: number;
  adultFlatMinor: number;
  totalMinor: number;
  currency: string;
};

export async function readBirthdayReceipt(
  tenantId: string,
  reservationId: string,
): Promise<BirthdayReceipt | null> {
  return withTenant(tenantId, async (tx) => {
    const found = await rows<{
      reference: string;
      local_date: string;
      starts_at: Date;
      children_count: number;
      adult_count: number;
      adult_flat_rate: boolean;
      price_minor_snapshot: number;
      adult_flat_total_minor: number;
      currency_snapshot: string;
      public_code: string | null;
      timezone: string;
    }>(
      tx,
      sql`
        select r.reference, r.local_date::text as local_date, r.starts_at, r.children_count,
               r.adult_count, r.adult_flat_rate, r.price_minor_snapshot, r.adult_flat_total_minor,
               r.currency_snapshot, p.public_code, l.timezone
        from reservations r
        join packages p on p.id = r.package_id
        join locations l on l.id = r.location_id
        where r.id = ${reservationId}
      `,
    );
    const row = found[0];
    if (!row || !row.public_code) return null;
    const pricePerChildMinor = row.price_minor_snapshot;
    const adultFlatMinor = row.adult_flat_total_minor;
    return {
      reference: row.reference,
      date: row.local_date,
      time: DateTime.fromJSDate(new Date(row.starts_at)).setZone(row.timezone).toFormat("HH:mm"),
      package: row.public_code,
      children: row.children_count,
      adults: row.adult_count,
      adultFlatRate: row.adult_flat_rate,
      pricePerChildMinor,
      adultFlatMinor,
      totalMinor: pricePerChildMinor * row.children_count + adultFlatMinor,
      currency: row.currency_snapshot.trim(),
    };
  });
}

export async function cancelReservation(args: {
  actor: ActorContext;
  reservationId: string;
  expectedVersion: number;
  correlationId: string;
}): Promise<{ id: string; status: string; version: number }> {
  return withTenant(args.actor.tenantId, async (tx) => {
    const found = await rows<{
      id: string;
      location_id: string;
      status: string;
      version: number;
      reference: string;
    }>(
      tx,
      sql`
        select id, location_id, status, version, reference
        from reservations where id = ${args.reservationId}
      `,
    );
    const current = found[0];
    if (!current) throw new AppError("not_found", "reservation");
    requirePermission(args.actor, "reservations.booking.cancel", current.location_id);
    if (current.status === "cancelled") {
      return { id: current.id, status: current.status, version: current.version };
    }
    if (current.version !== args.expectedVersion) throw new AppError("stale", "stale_version");
    if (current.status !== "confirmed" && current.status !== "requested") {
      throw new AppError("conflict", "invalid_transition");
    }
    const updated = await rows<{ id: string; version: number }>(
      tx,
      sql`
        update reservations
        set status = 'cancelled', version = version + 1, updated_at = now()
        where id = ${current.id} and version = ${args.expectedVersion}
        returning id, version
      `,
    );
    if (!updated[0]) throw new AppError("stale", "stale_version");
    await tx.execute(sql`delete from allocations where reservation_id = ${current.id}`);
    await invalidateQueuedReminders(tx, current.id);
    if (current.status === "confirmed") {
      await enqueueCancellation(tx, {
        tenantId: args.actor.tenantId,
        locationId: current.location_id,
        reservationId: current.id,
        reference: current.reference,
        version: updated[0].version,
      });
    }
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: current.location_id,
      actorPrincipalId: args.actor.principalId,
      action: "reservations.booking.cancel",
      targetType: "reservation",
      targetId: current.id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { status: "cancelled" },
    });
    return { id: current.id, status: "cancelled", version: updated[0].version };
  });
}

export type DailyRow = {
  id: string;
  reference: string;
  status: string;
  localTime: string;
  organizerName: string;
  organizerPhone: string;
  childrenCount: number;
  adultCount: number;
  packageName: string;
  priceMinor: number;
  currency: string;
  tables: string[];
  tasks: { title: string; status: string }[];
  version: number;
};

export async function dailyView(args: {
  actor: ActorContext;
  locationId: string;
  localDate: string;
}): Promise<DailyRow[]> {
  requirePermission(args.actor, "reservations.booking.read", args.locationId);
  return withTenant(args.actor.tenantId, async (tx) => {
    const reservations = await rows<{
      id: string;
      reference: string;
      status: string;
      starts_at: Date;
      organizer_name: string;
      organizer_phone: string;
      children_count: number;
      adult_count: number;
      package_name_snapshot: string;
      price_minor_snapshot: number;
      currency_snapshot: string;
      version: number;
      timezone: string;
    }>(
      tx,
      sql`
        select r.id, r.reference, r.status, r.starts_at, r.organizer_name, r.organizer_phone,
               r.children_count, r.adult_count, r.package_name_snapshot, r.price_minor_snapshot,
               r.currency_snapshot, r.version, l.timezone
        from reservations r
        join locations l on l.id = r.location_id
        where r.location_id = ${args.locationId} and r.local_date = ${args.localDate}::date
        order by r.starts_at
      `,
    );
    if (reservations.length === 0) return [];
    const idList = sql.join(
      reservations.map((row) => sql`${row.id}`),
      sql`, `,
    );
    const tables = await rows<{ reservation_id: string; name: string }>(
      tx,
      sql`
        select a.reservation_id, res.name
        from allocations a
        join resources res on res.id = a.resource_id
        where a.reservation_id in (${idList})
        order by res.name
      `,
    );
    const tasks = await rows<{ reservation_id: string; title: string; status: string }>(
      tx,
      sql`
        select reservation_id, title, status
        from reservation_tasks
        where reservation_id in (${idList})
      `,
    );
    return reservations.map((row) => ({
      id: row.id,
      reference: row.reference,
      status: row.status,
      localTime: DateTime.fromJSDate(new Date(row.starts_at)).setZone(row.timezone).toFormat("HH:mm"),
      organizerName: row.organizer_name,
      organizerPhone: row.organizer_phone,
      childrenCount: row.children_count,
      adultCount: row.adult_count,
      packageName: row.package_name_snapshot,
      priceMinor: row.price_minor_snapshot,
      currency: row.currency_snapshot.trim(),
      tables: tables.filter((table) => table.reservation_id === row.id).map((table) => table.name),
      tasks: tasks
        .filter((task) => task.reservation_id === row.id)
        .map((task) => ({ title: task.title, status: task.status })),
      version: row.version,
    }));
  });
}

export type ReservationDetail = DailyRow & {
  localDate: string;
  notes: string;
  sourceChannel: string;
};

export async function readReservation(args: {
  actor: ActorContext;
  locationId: string;
  reservationId: string;
}): Promise<ReservationDetail | null> {
  requirePermission(args.actor, "reservations.booking.read", args.locationId);
  return withTenant(args.actor.tenantId, async (tx) => {
    const reservations = await rows<{
      id: string;
      reference: string;
      status: string;
      starts_at: Date;
      organizer_name: string;
      organizer_phone: string;
      children_count: number;
      adult_count: number;
      package_name_snapshot: string;
      price_minor_snapshot: number;
      currency_snapshot: string;
      version: number;
      timezone: string;
      local_date: string;
      notes: string;
      source_channel: string;
    }>(
      tx,
      sql`
        select r.id, r.reference, r.status, r.starts_at, r.organizer_name, r.organizer_phone,
               r.children_count, r.adult_count, r.package_name_snapshot, r.price_minor_snapshot,
               r.currency_snapshot, r.version, l.timezone, r.local_date::text as local_date,
               r.notes, r.source_channel
        from reservations r
        join locations l on l.id = r.location_id
        where r.id = ${args.reservationId} and r.location_id = ${args.locationId}
      `,
    );
    const row = reservations[0];
    if (!row) return null;
    const tables = await rows<{ name: string }>(
      tx,
      sql`
        select res.name
        from allocations a
        join resources res on res.id = a.resource_id
        where a.reservation_id = ${row.id}
        order by res.name
      `,
    );
    const tasks = await rows<{ title: string; status: string }>(
      tx,
      sql`
        select title, status
        from reservation_tasks
        where reservation_id = ${row.id}
      `,
    );
    return {
      id: row.id,
      reference: row.reference,
      status: row.status,
      localTime: DateTime.fromJSDate(new Date(row.starts_at)).setZone(row.timezone).toFormat("HH:mm"),
      organizerName: row.organizer_name,
      organizerPhone: row.organizer_phone,
      childrenCount: row.children_count,
      adultCount: row.adult_count,
      packageName: row.package_name_snapshot,
      priceMinor: row.price_minor_snapshot,
      currency: row.currency_snapshot.trim(),
      tables: tables.map((table) => table.name),
      tasks,
      version: row.version,
      localDate: row.local_date,
      notes: row.notes,
      sourceChannel: row.source_channel,
    };
  });
}
