import { AppError } from "@masulino/contracts";
import { requirePermission, type ActorContext } from "@masulino/core";
import { rows, withTenant } from "@masulino/database";
import { sql } from "drizzle-orm";
import { DateTime } from "luxon";

export const bookedValueStatuses = ["confirmed"] as const;

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

const factKinds = ["collected_payment", "reportable_sale", "refund"] as const;

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
        select coalesce(sum(price_minor_snapshot), 0)::int as amount_minor,
               count(distinct currency_snapshot)::int as currencies,
               min(currency_snapshot) as currency
        from reservations
        where location_id = ${args.locationId}
          and status = 'confirmed'
          and local_date >= ${args.fromDate}::date
          and local_date <= ${args.toDate}::date
      `,
    );
    const total = booked[0];
    if ((total?.currencies ?? 0) > 1) throw new AppError("validation", "currency");
    const facts = await rows<{ kind: string; fact_count: number; amount_minor: number; currency: string }>(
      tx,
      sql`
        select kind, count(*)::int as fact_count, coalesce(sum(amount_minor), 0)::int as amount_minor,
               min(currency) as currency
        from financial_facts
        where location_id = ${args.locationId}
          and local_date >= ${args.fromDate}::date
          and local_date <= ${args.toDate}::date
          and kind in ('collected_payment', 'reportable_sale', 'refund')
        group by kind
      `,
    );
    const byKind = new Map(facts.map((row) => [row.kind, row]));
    function fact(kind: (typeof factKinds)[number]): MoneyFact {
      const row = byKind.get(kind);
      if (!row || row.fact_count === 0) return absent();
      return { connected: true, amountMinor: row.amount_minor, currency: row.currency.trim() };
    }
    return {
      fromDate: args.fromDate,
      toDate: args.toDate,
      includedStatuses: bookedValueStatuses,
      bookedValueMinor: total?.amount_minor ?? 0,
      currency: (total?.currency ?? "EUR").trim() || "EUR",
      collectedPayments: fact("collected_payment"),
      reportableSales: fact("reportable_sale"),
      refunds: fact("refund"),
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
