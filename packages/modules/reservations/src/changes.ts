import { AppError, type AllocationInput, type AllocationResult, type RescheduleBookingInput } from "@masulino/contracts";
import { insertAudit, requirePermission, type ActorContext } from "@masulino/core";
import { pgCode, rows, withTenant, type Tx } from "@masulino/database";
import { sql } from "drizzle-orm";
import { requireGuestSession } from "./access";
import { allocationInput, loadBookingContext } from "./context";
import { replaceReminder } from "./delivery";
import { classifyGuestPatch } from "./guest-policy";
import { minutesOfDay, parseVenueLocal } from "./time";

type Allocate = (input: AllocationInput) => AllocationResult;

export async function rescheduleReservation(args: {
  actor: ActorContext;
  input: RescheduleBookingInput;
  correlationId: string;
  allocate: Allocate;
}): Promise<{ id: string; version: number; localDate: string; localTime: string }> {
  try {
    return await withTenant(args.actor.tenantId, async (tx) => {
      const found = await rows<{
        id: string;
        location_id: string;
        status: string;
        version: number;
        reference: string;
        package_id: string;
        children_count: number;
        adult_count: number;
        local_date: string;
      }>(
        tx,
        sql`
          select id, location_id, status, version, reference, package_id, children_count, adult_count,
                 local_date::text as local_date
          from reservations
          where id = ${args.input.reservationId}
          for update
        `,
      );
      const current = found[0];
      if (!current) throw new AppError("not_found", "reservation");
      requirePermission(args.actor, "reservations.booking.update", current.location_id);
      if (current.status !== "confirmed") throw new AppError("conflict", "invalid_transition");
      if (current.version !== args.input.expectedVersion) throw new AppError("stale", "stale_version");
      const children = args.input.childrenCount ?? current.children_count;
      const adults = args.input.adultCount ?? current.adult_count;
      const loaded = await loadBookingContext(tx, current.location_id, current.package_id, args.input.localDate, {
        excludeReservationId: current.id,
      });
      if (children < loaded.pkg.minChildren || children > loaded.pkg.maxChildren) {
        throw new AppError("validation", "party_size");
      }
      const start = parseVenueLocal(args.input.localDate, args.input.localTime, loaded.rule.timezone);
      const end = start.plus({ minutes: loaded.pkg.durationMinutes });
      if (end.toISODate() !== start.toISODate()) throw new AppError("validation", "cross_midnight");
      const decision = args.allocate(
        allocationInput(
          loaded,
          { childrenCount: children, adultCount: adults, localDate: args.input.localDate },
          minutesOfDay(start),
          minutesOfDay(end),
          start,
          end,
        ),
      );
      if (!decision.ok) throw new AppError("conflict", "unavailable");
      const updated = await rows<{ version: number }>(
        tx,
        sql`
          update reservations
          set starts_at = ${start.toJSDate().toISOString()}::timestamptz,
              ends_at = ${end.toJSDate().toISOString()}::timestamptz,
              local_date = ${args.input.localDate}::date,
              children_count = ${children},
              adult_count = ${adults},
              combination_id = ${decision.choice.combinationId},
              version = version + 1,
              updated_at = now()
          where id = ${current.id} and version = ${args.input.expectedVersion}
          returning version
        `,
      );
      const next = updated[0];
      if (!next) throw new AppError("stale", "stale_version");
      await tx.execute(sql`delete from allocations where reservation_id = ${current.id}`);
      for (const resourceId of decision.choice.resourceIds) {
        await tx.execute(sql`
          insert into allocations (tenant_id, location_id, reservation_id, resource_id, occupancy)
          values (
            ${args.actor.tenantId}, ${current.location_id}, ${current.id}, ${resourceId},
            tstzrange(
              ${decision.choice.occupancyStart.toISOString()}::timestamptz,
              ${decision.choice.occupancyEnd.toISOString()}::timestamptz,
              '[)'
            )
          )
        `);
      }
      await replaceReminder(tx, {
        tenantId: args.actor.tenantId,
        locationId: current.location_id,
        reservationId: current.id,
        reference: current.reference,
        version: next.version,
        localDate: args.input.localDate,
        timezone: loaded.rule.timezone,
      });
      await insertAudit(tx, {
        tenantId: args.actor.tenantId,
        locationId: current.location_id,
        actorPrincipalId: args.actor.principalId,
        action: "reservations.booking.update",
        targetType: "reservation",
        targetId: current.id,
        outcome: "success",
        correlationId: args.correlationId,
        changes: { localDate: args.input.localDate, localTime: args.input.localTime, version: next.version },
      });
      return {
        id: current.id,
        version: next.version,
        localDate: args.input.localDate,
        localTime: args.input.localTime,
      };
    });
  } catch (error) {
    if (pgCode(error) === "23P01") throw new AppError("conflict", "unavailable");
    throw error;
  }
}

export async function applyGuestPatch(args: {
  sessionToken: string;
  patch: { expectedVersion: number; organizerPhone?: string; notes?: string };
  correlationId: string;
}): Promise<{ version: number }> {
  if (classifyGuestPatch(args.patch) !== "apply") {
    throw new AppError("validation", "staff_review");
  }
  const session = await requireGuestSession(args.sessionToken);
  return withTenant(session.tenant_id, async (tx) => {
    await assertReservationsOpen(tx);
    const phone = args.patch.organizerPhone ?? null;
    const notes = args.patch.notes === undefined ? null : args.patch.notes;
    const updated = await rows<{ version: number; location_id: string }>(
      tx,
      sql`
        update reservations
        set organizer_phone = coalesce(${phone}, organizer_phone),
            notes = case when ${notes}::text is null then notes else ${notes} end,
            version = version + 1,
            updated_at = now()
        where id = ${session.reservation_id}
          and version = ${args.patch.expectedVersion}
          and status in ('confirmed', 'requested')
        returning version, location_id
      `,
    );
    const next = updated[0];
    if (!next) throw new AppError("stale", "stale_version");
    await insertAudit(tx, {
      tenantId: session.tenant_id,
      locationId: next.location_id,
      action: "reservations.booking.update",
      targetType: "reservation",
      targetId: session.reservation_id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { organizerPhone: args.patch.organizerPhone, notes: args.patch.notes },
    });
    return { version: next.version };
  });
}

export async function routeGuestToStaff(args: {
  sessionToken: string;
  expectedVersion: number;
  kind: "change" | "cancel";
  message: string;
  correlationId: string;
}): Promise<{ routedToStaff: true }> {
  const session = await requireGuestSession(args.sessionToken);
  return withTenant(session.tenant_id, async (tx) => {
    const found = await rows<{ id: string; location_id: string; version: number; status: string }>(
      tx,
      sql`
        select id, location_id, version, status
        from reservations
        where id = ${session.reservation_id}
      `,
    );
    const current = found[0];
    if (!current) throw new AppError("not_found", "reservation");
    if (current.version !== args.expectedVersion) throw new AppError("stale", "stale_version");
    if (current.status !== "confirmed" && current.status !== "requested") {
      throw new AppError("conflict", "invalid_transition");
    }
    const clean = args.message.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
    const title = args.kind === "cancel" ? "Gast bittet um Stornierung" : `Gast bittet um Änderung${clean ? `: ${clean}` : ""}`;
    await tx.execute(sql`
      insert into reservation_tasks (tenant_id, location_id, reservation_id, title, status)
      values (${session.tenant_id}, ${current.location_id}, ${current.id}, ${title}, 'open')
    `);
    await insertAudit(tx, {
      tenantId: session.tenant_id,
      locationId: current.location_id,
      action: "reservations.booking.staff_request",
      targetType: "reservation",
      targetId: current.id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { kind: args.kind },
    });
    return { routedToStaff: true as const };
  });
}

async function assertReservationsOpen(tx: Tx): Promise<void> {
  const found = await rows<{ enabled: boolean }>(
    tx,
    sql`select enabled from module_entitlements where module_id = 'reservations'`,
  );
  if (found[0]?.enabled !== true) throw new AppError("forbidden", "entitlement");
}
