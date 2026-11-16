import { AppError } from "@masulino/contracts";
import { requirePermission, type ActorContext } from "@masulino/core";
import { rows, withTenant } from "@masulino/database";
import { sql } from "drizzle-orm";
import { DateTime } from "luxon";

export const bookedValueStatuses = ["confirmed", "completed"] as const;

export function isBirthdayPackage(name: string): boolean {
  return /geburtstag/i.test(name);
}

/** Promised package total: children times the per-child price, plus the adult flat rate. */
export function promisedBookingMinor(priceMinor: number, childrenCount: number, adultFlatTotalMinor: number): number {
  return priceMinor * childrenCount + adultFlatTotalMinor;
}

export type MoneyFact =
  | { connected: true; amountMinor: number; currency: string }
  | { connected: false };

export type BookedValueReport = {
  fromDate: string;
  toDate: string;
  includedStatuses: typeof bookedValueStatuses;
  bookedValueMinor: number;
  currency: string;
  collectedPayments: MoneyFact;
  reportableSales: MoneyFact;
  refunds: MoneyFact;
};

function absent(): MoneyFact {
  return { connected: false };
}

export async function readBookedValueReport(args: {
  actor: ActorContext;
  locationId: string;
  fromDate: string;
  toDate: string;
}): Promise<BookedValueReport> {
  requirePermission(args.actor, "reporting.booked_value.read", args.locationId);
  if (args.toDate < args.fromDate) throw new AppError("validation", "date_range");
  return withTenant(args.actor.tenantId, async (tx) => {
    const enabled = await rows<{ enabled: boolean }>(
      tx,
      sql`select enabled from module_entitlements where module_id = 'reservations'`,
    );
    if (enabled[0]?.enabled !== true) throw new AppError("forbidden", "entitlement");
    const location = await rows<{ id: string }>(
      tx,
      sql`select id from locations where id = ${args.locationId} and status = 'active'`,
    );
    if (!location[0]) throw new AppError("not_found", "location");
    const booked = await rows<{ amount_minor: number; currencies: number; currency: string | null }>(
      tx,
      sql`
        select coalesce(sum(price_minor_snapshot * children_count + adult_flat_total_minor), 0)::int as amount_minor,
               count(distinct currency_snapshot)::int as currencies,
               min(currency_snapshot) as currency
        from reservations
        where location_id = ${args.locationId}
          and status in ('confirmed', 'completed')
          and local_date >= ${args.fromDate}::date
          and local_date <= ${args.toDate}::date
      `,
    );
    const total = booked[0];
    if ((total?.currencies ?? 0) > 1) throw new AppError("validation", "currency");
    return {
      fromDate: args.fromDate,
      toDate: args.toDate,
      includedStatuses: bookedValueStatuses,
      bookedValueMinor: total?.amount_minor ?? 0,
      currency: (total?.currency ?? "EUR").trim() || "EUR",
      collectedPayments: absent(),
      reportableSales: absent(),
      refunds: absent(),
    };
  });
}

export type DayCount = { localDate: string; count: number };

export type UpcomingReservation = {
  id: string;
  reference: string;
  status: string;
  localDate: string;
  localTime: string;
  organizerName: string;
  packageName: string;
};

export type ReservationSpanRow = {
  id: string;
  localDate: string;
  localTime: string;
  status: string;
  organizerName: string;
  packageName: string;
  party: boolean;
  childrenCount: number;
  adultCount: number;
  tables: string[];
  bookedValueMinor: number;
  currency: string;
};

const maxSpanDays = 1500;

function spanLength(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return Number.NaN;
  return Math.round((to - from) / 86_400_000);
}

/** Reservations in a date window for the reports page. Cancelled and draft rows stay out. */
export async function readReservationSpan(args: {
  actor: ActorContext;
  locationId: string;
  fromDate: string;
  toDate: string;
}): Promise<ReservationSpanRow[]> {
  requirePermission(args.actor, "reporting.booked_value.read", args.locationId);
  requirePermission(args.actor, "reservations.booking.read", args.locationId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(args.toDate)) {
    throw new AppError("validation", "date_range");
  }
  const length = spanLength(args.fromDate, args.toDate);
  if (!Number.isFinite(length) || length < 0 || length > maxSpanDays) {
    throw new AppError("validation", "date_range");
  }
  return withTenant(args.actor.tenantId, async (tx) => {
    const enabled = await rows<{ enabled: boolean }>(
      tx,
      sql`select enabled from module_entitlements where module_id = 'reservations'`,
    );
    if (enabled[0]?.enabled !== true) throw new AppError("forbidden", "entitlement");
    const location = await rows<{ id: string }>(
      tx,
      sql`select id from locations where id = ${args.locationId} and status = 'active'`,
    );
    if (!location[0]) throw new AppError("not_found", "location");
    const reservations = await rows<{
      id: string;
      local_date: string;
      starts_at: Date;
      status: string;
      organizer_name: string;
      package_name_snapshot: string;
      children_count: number;
      adult_count: number;
      booked_value_minor: number;
      currency_snapshot: string;
      timezone: string;
    }>(
      tx,
      sql`
        select r.id, r.local_date::text as local_date, r.starts_at, r.status, r.organizer_name,
               r.package_name_snapshot, r.children_count, r.adult_count,
               (r.price_minor_snapshot * r.children_count + r.adult_flat_total_minor)::int as booked_value_minor,
               r.currency_snapshot, l.timezone
        from reservations r
        join locations l on l.id = r.location_id
        where r.location_id = ${args.locationId}
          and r.local_date >= ${args.fromDate}::date
          and r.local_date <= ${args.toDate}::date
          and r.status not in ('cancelled', 'draft')
        order by r.starts_at
      `,
    );
    if (reservations.length === 0) return [];
    const idList = sql.join(reservations.map((row) => sql`${row.id}`), sql`, `);
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
    return reservations.map((row) => ({
      id: row.id,
      localDate: row.local_date,
      localTime: DateTime.fromJSDate(new Date(row.starts_at)).setZone(row.timezone).toFormat("HH:mm"),
      status: row.status,
      organizerName: row.organizer_name,
      packageName: row.package_name_snapshot,
      party: isBirthdayPackage(row.package_name_snapshot),
      childrenCount: row.children_count,
      adultCount: row.adult_count,
      tables: tables.filter((table) => table.reservation_id === row.id).map((table) => table.name),
      bookedValueMinor: row.booked_value_minor,
      currency: row.currency_snapshot.trim() || "EUR",
    }));
  });
}

export async function readReservationActivity(args: {
  actor: ActorContext;
  locationId: string;
  fromDate: string;
  toDate: string;
}): Promise<{ countsByDay: DayCount[]; upcoming: UpcomingReservation[] }> {
  requirePermission(args.actor, "reservations.booking.read", args.locationId);
  if (args.toDate < args.fromDate) throw new AppError("validation", "date_range");
  return withTenant(args.actor.tenantId, async (tx) => {
    const location = await rows<{ timezone: string }>(
      tx,
      sql`select timezone from locations where id = ${args.locationId} and status = 'active'`,
    );
    const timezone = location[0]?.timezone;
    if (!timezone) throw new AppError("not_found", "location");
    const counts = await rows<{ local_date: string; count: number }>(
      tx,
      sql`
        select local_date::text as local_date, count(*)::int as count
        from reservations
        where location_id = ${args.locationId}
          and local_date >= ${args.fromDate}::date
          and local_date <= ${args.toDate}::date
          and status in ('confirmed', 'requested', 'completed')
        group by local_date
        order by local_date
      `,
    );
    const upcoming = await rows<{
      id: string;
      reference: string;
      status: string;
      local_date: string;
      starts_at: Date;
      organizer_name: string;
      package_name_snapshot: string;
    }>(
      tx,
      sql`
        select r.id, r.reference, r.status, r.local_date::text as local_date, r.starts_at,
               r.organizer_name, r.package_name_snapshot
        from reservations r
        join locations l on l.id = r.location_id
        where r.location_id = ${args.locationId}
          and r.local_date >= greatest(${args.fromDate}::date, (timezone(l.timezone, now()))::date)
          and r.local_date <= ${args.toDate}::date
          and r.status in ('confirmed', 'requested')
        order by r.starts_at
        limit 80
      `,
    );
    return {
      countsByDay: counts.map((row) => ({ localDate: row.local_date, count: row.count })),
      upcoming: upcoming.map((row) => ({
        id: row.id,
        reference: row.reference,
        status: row.status,
        localDate: row.local_date,
        localTime: DateTime.fromJSDate(new Date(row.starts_at)).setZone(timezone).toFormat("HH:mm"),
        organizerName: row.organizer_name,
        packageName: row.package_name_snapshot,
      })),
    };
  });
}
