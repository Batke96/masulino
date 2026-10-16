import { AppError, type AllocationInput, type AllocationResult } from "@masulino/contracts";
import { rows, withPublic, withTenant } from "@masulino/database";
import { sql } from "drizzle-orm";
import { allocationInput, assertModuleEnabled, bumpRate, formatMinute, loadBookingContext, openingFor } from "./context";
import { parseVenueLocal } from "./time";

type Allocate = (input: AllocationInput) => AllocationResult;

export type PublishedVenue = {
  tenantId: string;
  locationId: string;
  locationName: string;
  timezone: string;
  tenantName: string;
  publicSlug: string;
};

export async function resolvePublishedVenue(slug: string): Promise<PublishedVenue | null> {
  const found = await withPublic((tx) =>
    rows<{
      tenant_id: string;
      location_id: string;
      location_name: string;
      timezone: string;
      tenant_name: string;
      public_slug: string;
    }>(tx, sql`select * from app.lookup_published_venue(${slug})`),
  );
  const row = found[0];
  if (!row) return null;
  return {
    tenantId: row.tenant_id,
    locationId: row.location_id,
    locationName: row.location_name,
    timezone: row.timezone,
    tenantName: row.tenant_name,
    publicSlug: row.public_slug,
  };
}

export async function publicPackages(slug: string): Promise<{ id: string; name: string; priceMinor: number; currency: string }[]> {
  const venue = await resolvePublishedVenue(slug);
  if (!venue) throw new AppError("not_found", "venue");
  return withTenant(venue.tenantId, async (tx) => {
    await assertModuleEnabled(tx, "reservations");
    const packages = await rows<{ id: string; name: string; price_minor: number; currency: string }>(
      tx,
      sql`
        select id, name, price_minor, currency
        from packages
        where location_id = ${venue.locationId} and status = 'active'
        order by name
      `,
    );
    return packages.map((row) => ({
      id: row.id,
      name: row.name,
      priceMinor: row.price_minor,
      currency: row.currency.trim(),
    }));
  });
}

export type AvailabilitySlot = {
  localTime: string;
  available: boolean;
};

export async function publicAvailability(args: {
  slug: string;
  localDate: string;
  childrenCount: number;
  adultCount: number;
  packageId: string;
  allocate: Allocate;
}): Promise<{ closed: boolean; slots: AvailabilitySlot[] }> {
  const venue = await resolvePublishedVenue(args.slug);
  if (!venue) throw new AppError("not_found", "venue");
  return withTenant(venue.tenantId, async (tx) => {
    await assertModuleEnabled(tx, "reservations");
    await bumpRate(tx, venue.tenantId, `availability:${venue.locationId}`, 300);
    const loaded = await loadBookingContext(tx, venue.locationId, args.packageId, args.localDate);
    const opening = openingFor(loaded, args.localDate);
    if (!opening || loaded.closed) return { closed: true, slots: [] };
    const duration = loaded.pkg.durationMinutes;
    const slots: AvailabilitySlot[] = [];
    let checked = 0;
    for (let minute = opening.startMinute; minute + duration <= opening.endMinute; minute += loaded.rule.slotMinutes) {
      checked += 1;
      if (checked > 24) break;
      const localTime = formatMinute(minute);
      const start = parseVenueLocal(args.localDate, localTime, loaded.rule.timezone);
      const end = start.plus({ minutes: duration });
      const decision = args.allocate(
        allocationInput(
          loaded,
          { childrenCount: args.childrenCount, adultCount: args.adultCount, localDate: args.localDate },
          minute,
          minute + duration,
          start,
          end,
        ),
      );
      slots.push({ localTime, available: decision.ok });
    }
    return { closed: false, slots };
  });
}

export async function birthdayPackage(
  slug: string,
  code: string,
): Promise<{ tenantId: string; locationId: string; packageId: string }> {
  const venue = await resolvePublishedVenue(slug);
  if (!venue) throw new AppError("not_found", "venue");
  const found = await withTenant(venue.tenantId, async (tx) => {
    await assertModuleEnabled(tx, "reservations");
    return rows<{ id: string }>(
      tx,
      sql`
        select id from packages
        where location_id = ${venue.locationId}
          and status = 'active'
          and public_code = ${code}
      `,
    );
  });
  const pkg = found[0];
  if (!pkg) throw new AppError("not_found", "package", { package: code });
  return { tenantId: venue.tenantId, locationId: venue.locationId, packageId: pkg.id };
}

/** Times that can be booked for every requested package. Both packages share a duration today. */
export async function birthdayTimes(args: {
  slug: string;
  localDate: string;
  childrenCount: number;
  adultCount: number;
  packageCodes: readonly string[];
  allocate: Allocate;
}): Promise<{ closed: boolean; times: string[] }> {
  const venue = await resolvePublishedVenue(args.slug);
  if (!venue) throw new AppError("not_found", "venue");
  const packages = await withTenant(venue.tenantId, async (tx) => {
    await assertModuleEnabled(tx, "reservations");
    return rows<{ id: string; public_code: string }>(
      tx,
      sql`
        select id, public_code
        from packages
        where location_id = ${venue.locationId}
          and status = 'active'
          and public_code in (${sql.join(
            args.packageCodes.map((code) => sql`${code}`),
            sql`, `,
          )})
      `,
    );
  });
  for (const code of args.packageCodes) {
    if (!packages.some((row) => row.public_code === code)) {
      throw new AppError("not_found", "package", { package: code });
    }
  }
  const lists: string[][] = [];
  for (const code of args.packageCodes) {
    const pkg = packages.find((row) => row.public_code === code);
    if (!pkg) throw new AppError("not_found", "package", { package: code });
    const result = await publicAvailability({
      slug: args.slug,
      localDate: args.localDate,
      childrenCount: args.childrenCount,
      adultCount: args.adultCount,
      packageId: pkg.id,
      allocate: args.allocate,
    });
    if (result.closed) return { closed: true, times: [] };
    lists.push(result.slots.filter((slot) => slot.available).map((slot) => slot.localTime));
  }
  const [first, ...rest] = lists;
  const times = (first ?? []).filter((time) => rest.every((list) => list.includes(time)));
  return { closed: false, times };
}
