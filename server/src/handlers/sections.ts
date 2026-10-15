import { randomUUID } from "node:crypto";
import { eligibleAdults, listLocationAdults } from "@masulino/contacts";
import {
  allowedActions,
  drainOutbox,
  type ActorContext,
} from "@masulino/core";
import {
  cancelBookingSchema,
  createBookingSchema,
  campaignDraftSchema,
  isAppError,
} from "@masulino/contracts";
import { allocate, defaultPreparationTasks } from "@masulino/indoor-play";
import { listLedger, redeemReward } from "@masulino/loyalty";
import {
  approveCampaign,
  draftCampaign,
  listAudience,
  listCampaigns,
  sendCampaign,
} from "@masulino/marketing";
import { listStaffNotices } from "@masulino/notices";
import {
  cancelReservation,
  createStaffBooking,
  dailyView,
  readBookedValueReport,
  readReservation,
} from "@masulino/reservations";
import {
  listLocationAvailability,
  listPunches,
  readAvailability,
  readWeek,
} from "@masulino/workforce";
import { handleComposedOutbox } from "../outbox";
import { packagesFor } from "../queries";
import { describeRole, getStaffSession, resolveDefaultScope } from "../session";
import { errorResponse, json } from "../errors";

export type BookingViewModel = {
  id: string;
  time: string;
  name: string;
  detail: string;
  type: string;
  color: string;
  reference: string;
  status: string;
  version: number;
  packageName: string;
  childrenCount: number;
  adultCount: number;
  tables: string[];
};

function bookingColor(packageName: string, status: string): string {
  if (status === "requested") return "amber";
  if (/geburtstag/i.test(packageName)) return "violet";
  return "green";
}

function bookingType(packageName: string): string {
  if (/geburtstag/i.test(packageName)) return "Geburtstag";
  return "Gruppe";
}

function toBookingView(row: Awaited<ReturnType<typeof dailyView>>[number]): BookingViewModel {
  const tables = row.tables.length > 0 ? row.tables.join(", ") : "ohne Tisch";
  return {
    id: row.id,
    time: row.localTime,
    name: row.organizerName,
    detail: `${tables} · ${row.childrenCount} Kinder, ${row.adultCount} Erwachsene`,
    type: bookingType(row.packageName),
    color: bookingColor(row.packageName, row.status),
    reference: row.reference,
    status: row.status,
    version: row.version,
    packageName: row.packageName,
    childrenCount: row.childrenCount,
    adultCount: row.adultCount,
    tables: row.tables,
  };
}

function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function mondayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d!));
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  return utc.toISOString().slice(0, 10);
}

async function scope(request: Request) {
  return resolveDefaultScope(request);
}

export async function handleWorkspaceBootstrap(request: Request): Promise<Response> {
  try {
    const resolved = await scope(request);
    const staff = await getStaffSession(request);
    const membership = staff?.memberships.find((item) => item.tenant_id === resolved.tenantId);
    const role = describeRole(resolved.actor.grants);
    const actions = allowedActions({ ...resolved.actor, locationId: resolved.locationId });
    return json({
      source: "live",
      tenantId: resolved.tenantId,
      tenantSlug: resolved.tenantSlug,
      tenantName: membership?.tenant_name ?? resolved.tenantSlug,
      locationId: resolved.locationId,
      locationSlug: resolved.locationSlug,
      locationName: resolved.locationName,
      timezone: resolved.timezone,
      localDate: todayInTimezone(resolved.timezone),
      allowedActions: actions,
      user: {
        name: staff?.user.name ?? "",
        email: staff?.user.email ?? "",
        roleKey: role.roleKey,
        roleLabel: role.roleLabel,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleSection(
  request: Request,
  section: string,
): Promise<Response> {
  try {
    if (
      section === "tickets" ||
      section === "bistro" ||
      section === "agents" ||
      section === "assistant" ||
      section === "knowledge" ||
      section === "weather"
    ) {
      return json({ source: "fixture", section });
    }

    const resolved = await scope(request);
    const { actor, locationId, timezone } = resolved;
    const url = new URL(request.url);
    const localDate = url.searchParams.get("date") ?? todayInTimezone(timezone);

    switch (section) {
      case "bookings":
      case "birthdays": {
        const rows = await dailyView({ actor, locationId, localDate });
        const bookings = rows.map(toBookingView);
        const filtered =
          section === "birthdays"
            ? bookings.filter((item) => item.type === "Geburtstag")
            : bookings;
        return json({
          source: "live",
          section,
          localDate,
          bookings: filtered,
        });
      }
      case "families": {
        const adults = await listLocationAdults({ actor, locationId });
        const ledger = await listLedger(actor, locationId).catch((error: unknown) => {
          if (isAppError(error) && error.code === "forbidden") return [];
          throw error;
        });
        const balanceBySubject = new Map(
          ledger
            .filter((account) => account.subjectKind === "contact")
            .map((account) => [account.subjectId, account.balanceUnits] as const),
        );
        return json({
          source: "live",
          section,
          families: adults.map((adult) => ({
            id: adult.contactId,
            name: adult.displayName,
            lastVisit: "Nicht erfasst",
            points: balanceBySubject.get(adult.contactId) ?? 0,
            consent: adult.marketingDecision === "granted",
            longAbsent: false,
          })),
        });
      }
      case "team": {
        const weekStartsOn = mondayOf(localDate);
        const availability = await locationOrOwnAvailability(actor, locationId);
        const week = await ifForbidden(
          () => readWeek({ actor, locationId, weekStartsOn }),
          null,
        );
        const punches = await ifForbidden(() => listPunches(actor, locationId), []);
        return json({
          source: "live",
          section,
          weekStartsOn,
          availabilityScope: availability.scope,
          availability: availability.rows.map((row) => ({
            displayName: row.displayName,
            windows: row.windows,
          })),
          week: week
            ? {
                published: week.published
                  ? {
                      status: week.published.status,
                      shifts: week.published.shifts.map((shift) => ({
                        id: shift.id,
                        displayName: shift.displayName,
                        localDate: shift.localDate,
                        startMinute: shift.startMinute,
                        endMinute: shift.endMinute,
                      })),
                      warnings: week.published.warnings,
                    }
                  : null,
                draftCount: week.draft?.shifts.length ?? 0,
              }
            : null,
          punches: punches.slice(0, 12).map((punch) => ({
            id: punch.id,
            displayName: punch.displayName,
            kind: punch.kind,
            localDate: punch.localDate,
            localTime: punch.localTime,
          })),
        });
      }
      case "reports": {
        const fromDate = `${localDate.slice(0, 8)}01`;
        const report = await readBookedValueReport({
          actor,
          locationId,
          fromDate,
          toDate: localDate,
        });
        return json({
          source: "live",
          section,
          report,
          chart: "fixture",
        });
      }
      case "campaigns": {
        const [audience, campaigns] = await Promise.all([
          listAudience({ actor, locationId, readEligible: eligibleAdults }),
          listCampaigns({ actor, locationId }),
        ]);
        return json({
          source: "live",
          section,
          audience,
          campaigns,
          agentSuggestions: "fixture",
        });
      }
      case "portal": {
        const notices = await listStaffNotices(actor, locationId);
        return json({
          source: "live",
          section,
          notices,
          roadmap: "fixture",
        });
      }
      default:
        return json({ error: "not_found", details: "section" }, 404);
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handlePackages(request: Request): Promise<Response> {
  try {
    const resolved = await scope(request);
    const packages = await packagesFor(resolved.actor, resolved.locationId);
    return json({ source: "live", packages });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleCreateBooking(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const resolved = await scope(request);
    const parsed = createBookingSchema.safeParse({
      locationId: body.locationId ?? resolved.locationId,
      idempotencyKey: body.idempotencyKey,
      localDate: body.localDate ?? todayInTimezone(resolved.timezone),
      localTime: body.localTime ?? "16:00",
      childrenCount: Number(body.childrenCount),
      adultCount: Number(body.adultCount ?? 2),
      packageId: body.packageId,
      organizerName: body.organizerName,
      organizerEmail: body.organizerEmail,
      organizerPhone: body.organizerPhone,
      honoreeFirstName: body.honoreeFirstName,
      sourceChannel: body.sourceChannel ?? "staff_walk_in",
      notes: body.notes ?? "",
      mode: body.mode === "request" ? "request" : "confirm",
    });
    if (!parsed.success) return json({ error: "validation", details: parsed.error.flatten() }, 400);

    const result = await createStaffBooking({
      actor: resolved.actor,
      input: parsed.data,
      correlationId: randomUUID(),
      allocate,
      preparationTasks: defaultPreparationTasks,
    });
    if (!result.ok) {
      return json(
        {
          error: "conflict",
          alternatives: result.alternatives.map(
            (slot) => `${slot.localTime} · ${slot.combinationName}`,
          ),
        },
        409,
      );
    }
    const detail = await readReservation({
      actor: resolved.actor,
      locationId: resolved.locationId,
      reservationId: result.booking.id,
    });
    return json({
      source: "live",
      replayed: result.replayed,
      booking: detail ? toBookingView(detail) : null,
      reference: result.booking.reference,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleCancelBooking(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const resolved = await scope(request);
    const parsed = cancelBookingSchema.safeParse({
      reservationId: body.reservationId,
      expectedVersion: Number(body.expectedVersion),
    });
    if (!parsed.success) return json({ error: "validation" }, 400);
    await cancelReservation({
      actor: resolved.actor,
      reservationId: parsed.data.reservationId,
      expectedVersion: parsed.data.expectedVersion,
      correlationId: randomUUID(),
    });
    return json({ source: "live", ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleDraftCampaign(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const resolved = await scope(request);
    const parsed = campaignDraftSchema.safeParse({
      locationId: body.locationId ?? resolved.locationId,
      body: body.body,
      startsOn: body.startsOn,
    });
    if (!parsed.success) return json({ error: "validation" }, 400);
    const created = await draftCampaign({
      actor: resolved.actor,
      input: parsed.data,
      correlationId: randomUUID(),
    });
    return json({ source: "live", campaign: created });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleApproveCampaign(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const resolved = await scope(request);
    await approveCampaign({
      actor: resolved.actor,
      campaignId: String(body.campaignId ?? ""),
      correlationId: randomUUID(),
    });
    return json({ source: "live", ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleSendCampaign(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const resolved = await scope(request);
    await sendCampaign({
      actor: resolved.actor,
      campaignId: String(body.campaignId ?? ""),
      correlationId: randomUUID(),
      readEligible: eligibleAdults,
    });
    await drainOutbox("staff-send", handleComposedOutbox);
    return json({ source: "live", ok: true, delivery: "preview" });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleRedeemReward(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const resolved = await scope(request);
    await redeemReward({
      actor: resolved.actor,
      locationId: String(body.locationId ?? resolved.locationId),
      accountId: String(body.accountId ?? ""),
      units: Number(body.units),
      correlationId: randomUUID(),
    });
    return json({ source: "live", ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

async function ifForbidden<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isAppError(error) && error.code === "forbidden") return fallback;
    throw error;
  }
}

async function locationOrOwnAvailability(
  actor: ActorContext,
  locationId: string,
): Promise<{
  scope: "location" | "self" | "none";
  rows: Awaited<ReturnType<typeof listLocationAvailability>>;
}> {
  try {
    return { scope: "location", rows: await listLocationAvailability(actor, locationId) };
  } catch (error) {
    if (!isAppError(error) || error.code !== "forbidden") throw error;
  }
  try {
    const own = await readAvailability(actor, locationId, actor.principalId);
    return { scope: "self", rows: own ? [own] : [] };
  } catch (error) {
    if (!isAppError(error) || error.code !== "forbidden") throw error;
    return { scope: "none", rows: [] };
  }
}

/** Kept for typed imports used by tests; not a public route helper. */
export type { ActorContext };
