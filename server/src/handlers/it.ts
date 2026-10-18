import { randomUUID } from "node:crypto";
import {
  AppError,
  bookedValueQuerySchema,
  closureRecordSchema,
  combinationRecordSchema,
  inviteStaffSchema,
  isAppError,
  membershipActionSchema,
  packageRecordSchema,
  reservationContactSchema,
  resourceRecordSchema,
  rescheduleBookingSchema,
  venueSlugRecordSchema,
} from "@masulino/contracts";
import {
  inviteStaff,
  listStaffDirectory,
  restoreMembership,
  rolesActorMayAssign,
  suspendMembership,
} from "@masulino/core";
import { rows, withTenant } from "@masulino/database";
import { allocate } from "@masulino/indoor-play";
import {
  addClosure,
  listCatalog,
  listStaffReservations,
  readBookedValueReport,
  readReservationActivity,
  rescheduleReservation,
  updateCombinationRecord,
  updatePackageRecord,
  updatePublishedSlug,
  updateReservationContact,
  updateResourceRecord,
} from "@masulino/reservations";
import { sql } from "drizzle-orm";
import { errorResponse, json } from "../errors";
import { locationsFor } from "../queries";
import { resolveDefaultScope } from "../session";

function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, day!));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

async function locationScope(request: Request, locationId: string | null | undefined) {
  const resolved = await resolveDefaultScope(request);
  if (!locationId || locationId === resolved.locationId) return resolved;
  const found = await withTenant(resolved.actor.tenantId, async (tx) =>
    rows<{ id: string; name: string; timezone: string }>(
      tx,
      sql`select id, name, timezone from locations where id = ${locationId} and status = 'active'`,
    ),
  );
  const location = found[0];
  if (!location) throw new AppError("not_found", "location");
  return {
    ...resolved,
    locationId: location.id,
    locationName: location.name,
    timezone: location.timezone,
  };
}

async function ifForbidden<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    if (isAppError(error) && error.code === "forbidden") return null;
    throw error;
  }
}

export async function handleInviteStaff(request: Request): Promise<Response> {
  try {
    const resolved = await resolveDefaultScope(request);
    const body = (await request.json()) as unknown;
    const parsed = inviteStaffSchema.safeParse(body);
    if (!parsed.success) return json({ error: "validation", details: parsed.error.flatten() }, 400);
    const created = await inviteStaff(resolved.actor, parsed.data, randomUUID());
    return json({
      source: "live",
      invitationId: created.invitationId,
      acceptPath: created.acceptPath,
      email: parsed.data.email,
      roleKey: parsed.data.roleKey,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleItDirectory(request: Request): Promise<Response> {
  try {
    const resolved = await resolveDefaultScope(request);
    const directory = await listStaffDirectory(resolved.actor);
    const locations = await locationsFor(resolved.actor);
    return json({
      source: "live",
      members: directory.members,
      invitations: directory.invitations,
      roles: rolesActorMayAssign(resolved.actor),
      locations: locations.map((location) => ({ id: location.id, name: location.name })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleSuspendMembership(request: Request): Promise<Response> {
  try {
    const resolved = await resolveDefaultScope(request);
    const parsed = membershipActionSchema.safeParse(await request.json());
    if (!parsed.success) return json({ error: "validation" }, 400);
    await suspendMembership({
      actor: resolved.actor,
      membershipId: parsed.data.membershipId,
      correlationId: randomUUID(),
    });
    return json({ source: "live", ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleRestoreMembership(request: Request): Promise<Response> {
  try {
    const resolved = await resolveDefaultScope(request);
    const parsed = membershipActionSchema.safeParse(await request.json());
    if (!parsed.success) return json({ error: "validation" }, 400);
    await restoreMembership({
      actor: resolved.actor,
      membershipId: parsed.data.membershipId,
      correlationId: randomUUID(),
    });
    return json({ source: "live", ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleItReport(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const requestedLocation = url.searchParams.get("locationId");
    const resolved = await locationScope(request, requestedLocation);
    const today = todayInTimezone(resolved.timezone);
    const parsed = bookedValueQuerySchema.safeParse({
      locationId: resolved.locationId,
      fromDate: url.searchParams.get("from") ?? today,
      toDate: url.searchParams.get("to") ?? addDays(today, 30),
    });
    if (!parsed.success) return json({ error: "validation" }, 400);
    const activity = await ifForbidden(() =>
      readReservationActivity({
        actor: resolved.actor,
        locationId: parsed.data.locationId,
        fromDate: parsed.data.fromDate,
        toDate: parsed.data.toDate,
      }),
    );
    const booked = await ifForbidden(() =>
      readBookedValueReport({
        actor: resolved.actor,
        locationId: parsed.data.locationId,
        fromDate: parsed.data.fromDate,
        toDate: parsed.data.toDate,
      }),
    );
    if (!activity && !booked) throw new AppError("forbidden", "permission");
    return json({
      source: "live",
      locationId: parsed.data.locationId,
      fromDate: parsed.data.fromDate,
      toDate: parsed.data.toDate,
      countsByDay: activity?.countsByDay ?? [],
      upcoming: activity?.upcoming ?? [],
      activityDenied: activity === null,
      bookedValue: booked,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleItRecords(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const resolved = await locationScope(request, url.searchParams.get("locationId"));
    const today = todayInTimezone(resolved.timezone);
    const catalog = await listCatalog(resolved.actor, resolved.locationId);
    const reservations = await ifForbidden(() =>
      listStaffReservations({
        actor: resolved.actor,
        locationId: resolved.locationId,
        fromDate: addDays(today, -1),
        toDate: addDays(today, 60),
      }),
    );
    return json({
      source: "live",
      locationId: resolved.locationId,
      locationName: resolved.locationName,
      ...catalog,
      reservations: reservations ?? [],
      reservationsDenied: reservations === null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

async function mutate(
  request: Request,
  run: (actor: Awaited<ReturnType<typeof resolveDefaultScope>>["actor"], body: unknown) => Promise<unknown>,
): Promise<Response> {
  try {
    const resolved = await resolveDefaultScope(request);
    const result = await run(resolved.actor, await request.json());
    return json({ source: "live", ...(result && typeof result === "object" ? result : { ok: true }) });
  } catch (error) {
    return errorResponse(error);
  }
}

export function handleItPackage(request: Request): Promise<Response> {
  return mutate(request, async (actor, body) => {
    const parsed = packageRecordSchema.safeParse(body);
    if (!parsed.success) throw new AppError("validation", "package");
    await updatePackageRecord({ actor, input: parsed.data, correlationId: randomUUID() });
    return { ok: true };
  });
}

export function handleItResource(request: Request): Promise<Response> {
  return mutate(request, async (actor, body) => {
    const parsed = resourceRecordSchema.safeParse(body);
    if (!parsed.success) throw new AppError("validation", "resource");
    await updateResourceRecord({ actor, input: parsed.data, correlationId: randomUUID() });
    return { ok: true };
  });
}

export function handleItCombination(request: Request): Promise<Response> {
  return mutate(request, async (actor, body) => {
    const parsed = combinationRecordSchema.safeParse(body);
    if (!parsed.success) throw new AppError("validation", "combination");
    await updateCombinationRecord({ actor, input: parsed.data, correlationId: randomUUID() });
    return { ok: true };
  });
}

export function handleItClosure(request: Request): Promise<Response> {
  return mutate(request, async (actor, body) => {
    const parsed = closureRecordSchema.safeParse(body);
    if (!parsed.success) throw new AppError("validation", "closure");
    return addClosure({ actor, input: parsed.data, correlationId: randomUUID() });
  });
}

export function handleItVenue(request: Request): Promise<Response> {
  return mutate(request, async (actor, body) => {
    const parsed = venueSlugRecordSchema.safeParse(body);
    if (!parsed.success) throw new AppError("validation", "public_slug");
    await updatePublishedSlug({ actor, input: parsed.data, correlationId: randomUUID() });
    return { ok: true };
  });
}

export function handleReservationContact(request: Request): Promise<Response> {
  return mutate(request, async (actor, body) => {
    const parsed = reservationContactSchema.safeParse(body);
    if (!parsed.success) throw new AppError("validation", "reservation");
    return updateReservationContact({
      actor,
      reservationId: parsed.data.reservationId,
      expectedVersion: parsed.data.expectedVersion,
      organizerPhone: parsed.data.organizerPhone,
      notes: parsed.data.notes,
      correlationId: randomUUID(),
    });
  });
}

export function handleRescheduleBooking(request: Request): Promise<Response> {
  return mutate(request, async (actor, body) => {
    const parsed = rescheduleBookingSchema.safeParse(body);
    if (!parsed.success) throw new AppError("validation", "reservation");
    return rescheduleReservation({
      actor,
      input: parsed.data,
      correlationId: randomUUID(),
      allocate,
    });
  });
}
