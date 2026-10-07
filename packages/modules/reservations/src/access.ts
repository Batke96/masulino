import { createHash, randomBytes } from "node:crypto";
import { AppError } from "@masulino/contracts";
import { insertAudit, requirePermission, type ActorContext } from "@masulino/core";
import { rows, withPublic, withTenant, type Tx } from "@masulino/database";
import { sql } from "drizzle-orm";
import { DateTime } from "luxon";

export type GuestReservationView = {
  reference: string;
  status: string;
  version: number;
  localDate: string;
  localTime: string;
  childrenCount: number;
  adultCount: number;
  packageName: string;
  organizerName: string;
  organizerEmail: string;
  organizerPhone: string;
  notes: string;
  priceMinor: number;
  currency: string;
};

type TokenRow = {
  id: string;
  tenant_id: string;
  location_id: string;
  reservation_id: string;
  purpose: string;
  expires_at: Date | string;
  consumed_at: Date | string | null;
  revoked_at: Date | string | null;
};

function tokenHash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function isPast(value: Date | string | null): boolean {
  if (!value) return false;
  return new Date(value).getTime() <= Date.now();
}

async function lookupToken(raw: string): Promise<TokenRow | null> {
  const found = await withPublic((tx) =>
    rows<TokenRow>(tx, sql`select * from app.lookup_booking_token(${tokenHash(raw)})`),
  );
  return found[0] ?? null;
}

export async function issueExchangeToken(
  tx: Tx,
  input: { tenantId: string; locationId: string; reservationId: string },
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await tx.execute(sql`
    insert into booking_access_tokens (
      tenant_id, location_id, reservation_id, purpose, token_hash, expires_at
    ) values (
      ${input.tenantId}, ${input.locationId}, ${input.reservationId}, 'exchange',
      ${tokenHash(raw)}, now() + interval '7 days'
    )
  `);
  return raw;
}

export async function previewBookingLink(raw: string): Promise<"ready" | "invalid"> {
  const row = await lookupToken(raw);
  if (!row || row.purpose !== "exchange" || row.consumed_at || row.revoked_at || isPast(row.expires_at)) {
    return "invalid";
  }
  return "ready";
}

export async function exchangeBookingLink(raw: string, correlationId: string): Promise<{ sessionToken: string }> {
  const row = await lookupToken(raw);
  if (!row) throw new AppError("not_found", "link");
  if (row.purpose !== "exchange") throw new AppError("forbidden", "wrong_purpose");
  if (row.revoked_at) throw new AppError("not_found", "revoked");
  if (isPast(row.expires_at)) throw new AppError("not_found", "expired");
  if (row.consumed_at) throw new AppError("conflict", "replay");
  const sessionToken = randomBytes(32).toString("base64url");
  await withTenant(row.tenant_id, async (tx) => {
    const consumed = await rows<{ id: string }>(
      tx,
      sql`
        update booking_access_tokens
        set consumed_at = now()
        where id = ${row.id}
          and purpose = 'exchange'
          and consumed_at is null
          and revoked_at is null
          and expires_at > now()
        returning id
      `,
    );
    if (!consumed[0]) throw new AppError("conflict", "replay");
    await tx.execute(sql`
      insert into booking_access_tokens (
        tenant_id, location_id, reservation_id, purpose, token_hash, expires_at
      ) values (
        ${row.tenant_id}, ${row.location_id}, ${row.reservation_id}, 'session',
        ${tokenHash(sessionToken)}, now() + interval '30 minutes'
      )
    `);
    await insertAudit(tx, {
      tenantId: row.tenant_id,
      locationId: row.location_id,
      action: "reservations.booking.link_exchange",
      targetType: "reservation",
      targetId: row.reservation_id,
      outcome: "success",
      correlationId,
      changes: { purpose: "session" },
    });
  });
  return { sessionToken };
}

export async function requireGuestSession(raw: string): Promise<TokenRow> {
  const row = await lookupToken(raw);
  if (!row || row.purpose !== "session" || row.revoked_at || row.consumed_at || isPast(row.expires_at)) {
    throw new AppError("not_found", "link");
  }
  return row;
}

async function viewFor(tx: Tx, reservationId: string): Promise<GuestReservationView> {
  const found = await rows<{
    reference: string;
    status: string;
    version: number;
    local_date: string;
    starts_at: Date;
    children_count: number;
    adult_count: number;
    package_name_snapshot: string;
    organizer_name: string;
    organizer_email: string;
    organizer_phone: string;
    notes: string;
    price_minor_snapshot: number;
    currency_snapshot: string;
    timezone: string;
  }>(
    tx,
    sql`
      select r.reference, r.status, r.version, r.local_date::text as local_date, r.starts_at,
             r.children_count, r.adult_count, r.package_name_snapshot, r.organizer_name,
             r.organizer_email, r.organizer_phone, r.notes, r.price_minor_snapshot,
             r.currency_snapshot, l.timezone
      from reservations r
      join locations l on l.id = r.location_id
      where r.id = ${reservationId}
    `,
  );
  const row = found[0];
  if (!row) throw new AppError("not_found", "reservation");
  return {
    reference: row.reference,
    status: row.status,
    version: row.version,
    localDate: row.local_date,
    localTime: DateTime.fromJSDate(new Date(row.starts_at)).setZone(row.timezone).toFormat("HH:mm"),
    childrenCount: row.children_count,
    adultCount: row.adult_count,
    packageName: row.package_name_snapshot,
    organizerName: row.organizer_name,
    organizerEmail: row.organizer_email,
    organizerPhone: row.organizer_phone,
    notes: row.notes,
    priceMinor: row.price_minor_snapshot,
    currency: row.currency_snapshot.trim(),
  };
}

export async function readGuestReservation(sessionToken: string): Promise<GuestReservationView> {
  const session = await requireGuestSession(sessionToken);
  return withTenant(session.tenant_id, async (tx) => viewFor(tx, session.reservation_id));
}

export async function revokeGuestLinks(args: {
  actor: ActorContext;
  reservationId: string;
  correlationId: string;
}): Promise<void> {
  await withTenant(args.actor.tenantId, async (tx) => {
    const found = await rows<{ location_id: string }>(
      tx,
      sql`select location_id from reservations where id = ${args.reservationId}`,
    );
    const current = found[0];
    if (!current) throw new AppError("not_found", "reservation");
    requirePermission(args.actor, "reservations.booking.update", current.location_id);
    await tx.execute(sql`
      update booking_access_tokens
      set revoked_at = now()
      where reservation_id = ${args.reservationId} and revoked_at is null
    `);
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: current.location_id,
      actorPrincipalId: args.actor.principalId,
      action: "reservations.booking.link_revoke",
      targetType: "reservation",
      targetId: args.reservationId,
      outcome: "success",
      correlationId: args.correlationId,
    });
  });
}
