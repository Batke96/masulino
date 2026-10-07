import type { BookingFactsLoader } from "@masulino/workforce";
import { rows } from "@masulino/database";
import { sql } from "drizzle-orm";

export const confirmedBookingFacts: BookingFactsLoader = async ({
  tx,
  locationId,
  fromDate,
  toDate,
}) => {
  const found = await rows<{ local_date: string; children_count: number }>(
    tx,
    sql`
      select local_date::text as local_date, children_count
      from reservations
      where location_id = ${locationId}
        and status = 'confirmed'
        and local_date >= ${fromDate}::date
        and local_date <= ${toDate}::date
    `,
  );
  return found.map((row) => ({
    localDate: String(row.local_date).slice(0, 10),
    childrenCount: row.children_count,
  }));
};
