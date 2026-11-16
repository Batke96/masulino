import { randomBytes, randomUUID } from "node:crypto";
import {
  AppError,
  createBookingSchema,
  isAppError,
  isReservationEmail,
  readStoredWebsiteBooking,
  windowStart,
  type AllocationInput,
  type AllocationResult,
  type WebsiteBirthday,
  type WebsiteBooking,
  type WebsiteKita,
} from "@masulino/contracts";
import { insertAudit, requirePermission, type ActorContext } from "@masulino/core";
import { pgCode, rows, withTenant, type Tx } from "@masulino/database";
import { sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { createStaffBooking } from "./booking";
import { bumpRate } from "./context";
import { enqueueConfirmationAndReminder } from "./delivery";
import { parseVenueLocal } from "./time";

type Allocate = (input: AllocationInput) => AllocationResult;

const GROUP_CODE = "gruppenbesuch";
const GROUP_NAME = "Kita- und Schulbesuch";
const GROUP_DURATION_MINUTES = 240;
const GROUP_START = "09:00";

export type WebsiteRequestStatus = "angefragt" | "bearbeitet" | "angenommen" | "abgelehnt";

export type WebsiteRequestView = {
  id: string;
  kind: "geburtstag" | "kita";
  status: WebsiteRequestStatus;
  receivedAt: string;
  reservationId: string | null;
  reference: string | null;
  rejectionReason: string;
  payload: WebsiteBooking | null;
};

export type WebsiteRequestDecisionResult =
  | { ok: true; request: WebsiteRequestView }
  | { ok: false; reason: string };

export type AcceptWebsiteRequestResult =
  | {
      ok: true;
      request: WebsiteRequestView;
      reference: string;
      localDate: string;
      localTime: string;
      durationMinutes: number;
    }
  | { ok: false; reason: string };

type RequestRow = {
  id: string;
  kind: "geburtstag" | "kita";
  status: WebsiteRequestStatus;
  payload: unknown;
  received_at: Date | string;
  reservation_id: string | null;
  rejection_reason: string;
  reference: string | null;
};

function euro(cents: number): string {
  const whole = Math.trunc(cents / 100).toLocaleString("de-DE");
  const fraction = String(Math.abs(cents % 100)).padStart(2, "0");
  return `${whole},${fraction} €`;
}

function stamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

function asPayload(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  return value;
}

function toView(row: RequestRow): WebsiteRequestView {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    receivedAt: stamp(row.received_at),
    reservationId: row.reservation_id,
    reference: row.reference,
    rejectionReason: row.rejection_reason,
    payload: readStoredWebsiteBooking(asPayload(row.payload)),
  };
}

const requestSelect = sql`
  select r.id, r.kind, r.status, r.payload, r.received_at, r.reservation_id, r.rejection_reason,
         res.reference
  from website_booking_requests r
  left join reservations res on res.id = r.reservation_id
`;

async function readRow(tx: Tx, locationId: string, requestId: string): Promise<RequestRow | null> {
  const found = await rows<RequestRow>(
    tx,
    sql`
      ${requestSelect}
      where r.location_id = ${locationId} and r.id = ${requestId}
    `,
  );
  return found[0] ?? null;
}

export async function storeWebsiteRequest(args: {
  tenantId: string;
  locationId: string;
  booking: WebsiteBooking;
}): Promise<void> {
  await withTenant(args.tenantId, async (tx) => {
    await bumpRate(tx, args.tenantId, `website-buchungen:${args.locationId}`, 60);
    await tx.execute(sql`
      insert into website_booking_requests (tenant_id, location_id, kind, status, payload)
      values (
        ${args.tenantId}, ${args.locationId}, ${args.booking.buchung}, 'angefragt',
        ${JSON.stringify(args.booking)}::jsonb
      )
    `);
  });
}

export async function listWebsiteRequests(args: {
  actor: ActorContext;
  locationId: string;
  scope: "open" | "all";
}): Promise<WebsiteRequestView[]> {
  requirePermission(args.actor, "reservations.booking.read", args.locationId);
  return withTenant(args.actor.tenantId, async (tx) => {
    const found = await rows<RequestRow>(
      tx,
      args.scope === "open"
        ? sql`
            ${requestSelect}
            where r.location_id = ${args.locationId}
              and r.status in ('angefragt', 'bearbeitet')
            order by r.received_at desc
            limit 200
          `
        : sql`
            ${requestSelect}
            where r.location_id = ${args.locationId}
            order by r.received_at desc
            limit 200
          `,
    );
    return found.map(toView);
  });
}

export async function reviewWebsiteRequest(args: {
  actor: ActorContext;
  locationId: string;
  requestId: string;
}): Promise<WebsiteRequestDecisionResult> {
  requirePermission(args.actor, "reservations.booking.update", args.locationId);
  return withTenant(args.actor.tenantId, async (tx) => {
    const current = await readRow(tx, args.locationId, args.requestId);
    if (!current) throw new AppError("not_found", "request");
    if (current.status === "bearbeitet") return { ok: true, request: toView(current) };
    if (current.status !== "angefragt") {
      return { ok: false, reason: "Nur eine angefragte Buchung kann als bearbeitet markiert werden." };
    }
    await tx.execute(sql`
      update website_booking_requests
      set status = 'bearbeitet', decided_at = now(), decided_by_principal_id = ${args.actor.principalId}
      where id = ${args.requestId} and location_id = ${args.locationId} and status = 'angefragt'
    `);
    const updated = await readRow(tx, args.locationId, args.requestId);
    if (!updated) throw new AppError("not_found", "request");
    return { ok: true, request: toView(updated) };
  });
}

export async function rejectWebsiteRequest(args: {
  actor: ActorContext;
  locationId: string;
  requestId: string;
  reason: string;
}): Promise<WebsiteRequestDecisionResult> {
  requirePermission(args.actor, "reservations.booking.update", args.locationId);
  const reason = args.reason.trim().slice(0, 500);
  return withTenant(args.actor.tenantId, async (tx) => {
    const current = await readRow(tx, args.locationId, args.requestId);
    if (!current) throw new AppError("not_found", "request");
    if (current.status === "abgelehnt") return { ok: true, request: toView(current) };
    if (current.status === "angenommen") {
      return { ok: false, reason: "Eine angenommene Buchung kann hier nicht abgelehnt werden." };
    }
    await tx.execute(sql`
      update website_booking_requests
      set status = 'abgelehnt',
          rejection_reason = ${reason},
          decided_at = now(),
          decided_by_principal_id = ${args.actor.principalId}
      where id = ${args.requestId}
        and location_id = ${args.locationId}
        and status in ('angefragt', 'bearbeitet')
    `);
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: args.locationId,
      actorPrincipalId: args.actor.principalId,
      action: "reservations.website_request.reject",
      targetType: "website_booking_request",
      targetId: args.requestId,
      outcome: "success",
      correlationId: randomUUID(),
      changes: { status: "abgelehnt" },
    });
    const updated = await readRow(tx, args.locationId, args.requestId);
    if (!updated) throw new AppError("not_found", "request");
    return { ok: true, request: toView(updated) };
  });
}

type ReservationLink = {
  reference: string;
  localDate: string;
  localTime: string;
  durationMinutes: number;
};

async function reservationLink(tx: Tx, reservationId: string): Promise<ReservationLink | null> {
  const found = await rows<{
    reference: string;
    local_date: string;
    starts_at: Date;
    duration_minutes: number;
    timezone: string;
  }>(
    tx,
    sql`
      select r.reference, r.local_date::text as local_date, r.starts_at, p.duration_minutes, l.timezone
      from reservations r
      join packages p on p.id = r.package_id
      join locations l on l.id = r.location_id
      where r.id = ${reservationId}
    `,
  );
  const row = found[0];
  if (!row) return null;
  return {
    reference: row.reference,
    localDate: row.local_date,
    localTime: DateTime.fromJSDate(new Date(row.starts_at)).setZone(row.timezone).toFormat("HH:mm"),
    durationMinutes: row.duration_minutes,
  };
}

async function linkAccepted(args: {
  tx: Tx;
  actor: ActorContext;
  locationId: string;
  requestId: string;
  reservationId: string;
  kind: "geburtstag" | "kita";
}): Promise<WebsiteRequestView> {
  await args.tx.execute(sql`
    update website_booking_requests
    set status = 'angenommen',
        reservation_id = ${args.reservationId},
        rejection_reason = '',
        decided_at = now(),
        decided_by_principal_id = ${args.actor.principalId}
    where id = ${args.requestId}
      and location_id = ${args.locationId}
      and status in ('angefragt', 'bearbeitet')
  `);
  await insertAudit(args.tx, {
    tenantId: args.actor.tenantId,
    locationId: args.locationId,
    actorPrincipalId: args.actor.principalId,
    action: "reservations.website_request.accept",
    targetType: "website_booking_request",
    targetId: args.requestId,
    outcome: "success",
    correlationId: randomUUID(),
    changes: { status: "angenommen", kind: args.kind, reservationId: args.reservationId },
  });
  const updated = await readRow(args.tx, args.locationId, args.requestId);
  if (!updated) throw new AppError("not_found", "request");
  return toView(updated);
}

function birthdayNotes(booking: WebsiteBirthday): string {
  const age = Number(booking.kind_alter);
  const lines = [
    `Zeitfenster: ${booking.zeitfenster}`,
    `Vorschau der Website: ${euro(booking.summeVorschau)}`,
    `Kleinkinder: ${booking.kleinkinder}`,
  ];
  if (age > 17) lines.push(`Alter: ${booking.kind_alter}`);
  if (booking.nachricht) lines.push(`Nachricht: ${booking.nachricht}`);
  return lines.join("\n").slice(0, 500);
}

async function acceptBirthday(args: {
  actor: ActorContext;
  locationId: string;
  requestId: string;
  booking: WebsiteBirthday;
  allocate: Allocate;
  preparationTasks: string[];
  correlationId: string;
}): Promise<AcceptWebsiteRequestResult> {
  if (!isReservationEmail(args.booking.email)) {
    return { ok: false, reason: "Die E-Mail passt nicht in den Buchungsservice." };
  }
  if (
    args.booking.kind_name.length > 80 ||
    args.booking.vorname.length > 80 ||
    args.booking.nachname.length > 80
  ) {
    return { ok: false, reason: "Ein Name ist länger als 80 Zeichen und passt nicht in den Buchungsservice." };
  }
  if (args.booking.kinder > 40 || args.booking.erwachsene > 40) {
    return { ok: false, reason: "Mehr als 40 Kinder oder Erwachsene passen nicht ins Geburtstagspaket." };
  }
  const pkg = await withTenant(args.actor.tenantId, async (tx) =>
    rows<{ id: string; max_children: number; duration_minutes: number }>(
      tx,
      sql`
        select id, max_children, duration_minutes
        from packages
        where location_id = ${args.locationId}
          and status = 'active'
          and public_code = ${args.booking.paket}
      `,
    ),
  );
  const found = pkg[0];
  if (!found) return { ok: false, reason: "Das Paket ist am Standort nicht eingerichtet." };
  if (args.booking.kinder > found.max_children || args.booking.kinder < 1) {
    return { ok: false, reason: "Die Kinderzahl passt nicht zum Paket." };
  }
  const age = Number(args.booking.kind_alter);
  const parsed = createBookingSchema.safeParse({
    locationId: args.locationId,
    idempotencyKey: args.requestId,
    localDate: args.booking.datum,
    localTime: windowStart(args.booking.zeitfenster),
    childrenCount: args.booking.kinder,
    adultCount: args.booking.erwachsene,
    packageId: found.id,
    organizerName: `${args.booking.vorname} ${args.booking.nachname}`,
    organizerEmail: args.booking.email,
    organizerPhone: args.booking.telefon,
    honoreeFirstName: args.booking.kind_name,
    honoreeAge: age <= 17 ? age : undefined,
    organizerGivenName: args.booking.vorname,
    organizerFamilyName: args.booking.nachname,
    adultFlatRate: args.booking.erwachsenenZusatz,
    referralSource: args.booking.quelle,
    sourceChannel: "guest_web",
    notes: birthdayNotes(args.booking),
    mode: "confirm",
  });
  if (!parsed.success) {
    return { ok: false, reason: "Die Anfrage passt nicht in den Buchungsservice." };
  }
  let result: Awaited<ReturnType<typeof createStaffBooking>>;
  try {
    result = await createStaffBooking({
      actor: args.actor,
      input: parsed.data,
      correlationId: args.correlationId,
      allocate: args.allocate,
      preparationTasks: () => args.preparationTasks,
    });
  } catch (error) {
    if (isAppError(error) && (error.code === "validation" || error.code === "incomplete_rules")) {
      return { ok: false, reason: "Die Anfrage passt nicht in den Buchungsservice." };
    }
    throw error;
  }
  if (!result.ok) {
    const times = [...new Set(result.alternatives.map((slot) => slot.localTime))];
    const hint = times.length > 0 ? ` Mögliche Zeiten: ${times.join(", ")}.` : "";
    return { ok: false, reason: `Kein Tisch ist für ${parsed.data.localTime} frei.${hint}` };
  }
  const created = result.booking;
  const request = await withTenant(args.actor.tenantId, async (tx) => {
    const view = await linkAccepted({
      tx,
      actor: args.actor,
      locationId: args.locationId,
      requestId: args.requestId,
      reservationId: created.id,
      kind: "geburtstag",
    });
    const link = await reservationLink(tx, created.id);
    return { view, link };
  });
  if (!request.link || request.view.status !== "angenommen") {
    return { ok: false, reason: "Die Anfrage wurde inzwischen abgelehnt." };
  }
  return {
    ok: true,
    request: request.view,
    reference: request.link.reference,
    localDate: request.link.localDate,
    localTime: request.link.localTime,
    durationMinutes: request.link.durationMinutes,
  };
}

function kitaNotes(booking: WebsiteKita): string {
  const lines = [
    `Einrichtung: ${booking.einrichtung}`,
    `Art: ${booking.art}`,
    `Pädagogen: ${booking.paedagogen}`,
    `Begleitpersonen: ${booking.begleitpersonen}`,
    `Vorschau der Website: ${euro(booking.summeVorschau)}`,
  ];
  if (booking.quelle) lines.push(`Quelle: ${booking.quelle}`);
  if (booking.nachricht) lines.push(`Nachricht: ${booking.nachricht}`);
  return lines.join("\n").slice(0, 2000);
}

async function ensureGroupPackage(tenantId: string, locationId: string): Promise<void> {
  try {
    await withTenant(tenantId, async (tx) => {
      await tx.execute(sql`
        insert into packages (
          id, tenant_id, location_id, name, duration_minutes, price_minor, currency,
          min_children, max_children, public_code, fixture
        )
        select ${randomUUID()}, ${tenantId}, ${locationId}, ${GROUP_NAME}, ${GROUP_DURATION_MINUTES},
               0, 'EUR', 1, 500, ${GROUP_CODE}, false
        where not exists (
          select 1 from packages
          where tenant_id = ${tenantId}
            and location_id = ${locationId}
            and public_code = ${GROUP_CODE}
        )
      `);
    });
  } catch (error) {
    if (pgCode(error) !== "23505") throw error;
  }
}

async function acceptKita(args: {
  actor: ActorContext;
  locationId: string;
  requestId: string;
  booking: WebsiteKita;
  preparationTasks: string[];
}): Promise<AcceptWebsiteRequestResult> {
  if (!isReservationEmail(args.booking.email)) {
    return { ok: false, reason: "Die E-Mail passt nicht in den Buchungsservice." };
  }
  await ensureGroupPackage(args.actor.tenantId, args.locationId);
  return withTenant(args.actor.tenantId, async (tx) => {
    const locked = await rows<RequestRow>(
      tx,
      sql`
        ${requestSelect}
        where r.location_id = ${args.locationId} and r.id = ${args.requestId}
        for update of r
      `,
    );
    const current = locked[0];
    if (!current) throw new AppError("not_found", "request");
    if (current.status === "angenommen" && current.reservation_id) {
      const link = await reservationLink(tx, current.reservation_id);
      if (!link) throw new AppError("not_found", "reservation");
      return { ok: true, request: toView(current), ...link };
    }
    if (current.status === "abgelehnt") {
      return { ok: false, reason: "Die Anfrage ist bereits abgelehnt." };
    }
    const pkg = await rows<{ id: string }>(
      tx,
      sql`
        select id from packages
        where location_id = ${args.locationId} and status = 'active' and public_code = ${GROUP_CODE}
      `,
    );
    const rule = await rows<{ id: string; version: number; timezone: string }>(
      tx,
      sql`
        select id, version, timezone
        from venue_rules
        where location_id = ${args.locationId} and status = 'published'
      `,
    );
    if (!pkg[0] || !rule[0]) {
      return { ok: false, reason: "Für den Standort fehlt das Gruppenpaket oder eine Öffnungsregel." };
    }
    const start = parseVenueLocal(args.booking.wunschtermin, GROUP_START, rule[0].timezone);
    const end = start.plus({ minutes: GROUP_DURATION_MINUTES });
    const reservationId = randomUUID();
    const reference = `MS-${randomBytes(5).toString("hex").toUpperCase()}`;
    await tx.execute(sql`
      insert into reservations (
        id, tenant_id, location_id, reference, status, organizer_name, organizer_email,
        organizer_phone, referral_source, starts_at, ends_at, local_date, children_count,
        adult_count, package_id, package_name_snapshot, price_minor_snapshot, currency_snapshot,
        rule_id, rule_version_snapshot, source_channel, notes, version, created_by_principal_id
      ) values (
        ${reservationId}, ${args.actor.tenantId}, ${args.locationId}, ${reference}, 'confirmed',
        ${args.booking.ansprechpartner}, ${args.booking.email}, ${args.booking.telefon},
        ${args.booking.quelle},
        ${start.toJSDate().toISOString()}::timestamptz,
        ${end.toJSDate().toISOString()}::timestamptz,
        ${args.booking.wunschtermin}::date,
        ${args.booking.kinder}, ${args.booking.paedagogen + args.booking.begleitpersonen},
        ${pkg[0].id}, ${GROUP_NAME}, 0, 'EUR', ${rule[0].id}, ${rule[0].version},
        'guest_web', ${kitaNotes(args.booking)}, 1, ${args.actor.principalId}
      )
    `);
    for (const title of args.preparationTasks) {
      await tx.execute(sql`
        insert into reservation_tasks (tenant_id, location_id, reservation_id, title, status)
        values (${args.actor.tenantId}, ${args.locationId}, ${reservationId}, ${title}, 'open')
      `);
    }
    await enqueueConfirmationAndReminder(tx, {
      tenantId: args.actor.tenantId,
      locationId: args.locationId,
      reservationId,
      reference,
      version: 1,
      localDate: args.booking.wunschtermin,
      timezone: rule[0].timezone,
    });
    const request = await linkAccepted({
      tx,
      actor: args.actor,
      locationId: args.locationId,
      requestId: args.requestId,
      reservationId,
      kind: "kita",
    });
    return {
      ok: true,
      request,
      reference,
      localDate: args.booking.wunschtermin,
      localTime: GROUP_START,
      durationMinutes: GROUP_DURATION_MINUTES,
    };
  });
}

export async function acceptWebsiteRequest(args: {
  actor: ActorContext;
  locationId: string;
  requestId: string;
  allocate: Allocate;
  preparationTasks: string[];
  correlationId: string;
}): Promise<AcceptWebsiteRequestResult> {
  requirePermission(args.actor, "reservations.booking.create", args.locationId);
  const current = await withTenant(args.actor.tenantId, (tx) => readRow(tx, args.locationId, args.requestId));
  if (!current) throw new AppError("not_found", "request");
  if (current.status === "angenommen" && current.reservation_id) {
    const link = await withTenant(args.actor.tenantId, (tx) => reservationLink(tx, current.reservation_id!));
    if (!link) throw new AppError("not_found", "reservation");
    return { ok: true, request: toView(current), ...link };
  }
  if (current.status === "abgelehnt") {
    return { ok: false, reason: "Die Anfrage ist bereits abgelehnt." };
  }
  const booking = readStoredWebsiteBooking(asPayload(current.payload));
  if (!booking) return { ok: false, reason: "Die gespeicherte Anfrage ist unvollständig." };
  if (booking.buchung === "geburtstag") {
    return acceptBirthday({ ...args, booking });
  }
  return acceptKita({ ...args, booking });
}
