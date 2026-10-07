import { createHash } from "node:crypto";
import {
  AppError,
  openingHoursSchema,
  type AllocationInput,
  type AllocationResult,
  type AlternativeSlot,
  type CreateBookingInput,
  type OpeningHours,
} from "@masulino/contracts";
import { rows, type Tx } from "@masulino/database";
import { sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { assertCanUsePublishedRule } from "./rules";
import { minutesOfDay, parseVenueLocal, weekdayKey } from "./time";

type Allocate = (input: AllocationInput) => AllocationResult;

export type BookingDraft = {
  childrenCount: number;
  adultCount: number;
  localDate: string;
};

export type Loaded = {
  rule: {
    id: string;
    version: number;
    timezone: string;
    bufferBefore: number;
    bufferAfter: number;
    slotMinutes: number;
    openingHours: OpeningHours;
    adultSeating: "not_required" | "required";
  };
  pkg: {
    id: string;
    name: string;
    durationMinutes: number;
    priceMinor: number;
    currency: string;
    minChildren: number;
    maxChildren: number;
  };
  combinations: AllocationInput["combinations"];
  resources: AllocationInput["resources"];
  occupancy: AllocationInput["occupancy"];
  closed: boolean;
};

export function hashPayload(input: CreateBookingInput): string {
  const { idempotencyKey: _ignored, ...rest } = input;
  return createHash("sha256").update(stable(rest)).digest("hex");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stable(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function formatMinute(minute: number): string {
  return `${Math.floor(minute / 60)
    .toString()
    .padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}`;
}

export async function assertModuleEnabled(tx: Tx, moduleId: string): Promise<void> {
  const found = await rows<{ enabled: boolean }>(
    tx,
    sql`select enabled from module_entitlements where module_id = ${moduleId}`,
  );
  if (found[0]?.enabled !== true) throw new AppError("forbidden", "entitlement");
}

export async function assertPublishedVenue(tx: Tx, locationId: string): Promise<void> {
  const found = await rows<{ id: string }>(
    tx,
    sql`select id from published_venues where location_id = ${locationId} and status = 'published'`,
  );
  if (!found[0]) throw new AppError("not_found", "venue");
}

export async function loadBookingContext(
  tx: Tx,
  locationId: string,
  packageId: string,
  localDate: string,
  options?: { excludeReservationId?: string },
): Promise<Loaded> {
  const location = await rows<{ id: string; timezone: string }>(
    tx,
    sql`select id, timezone from locations where id = ${locationId} and status = 'active'`,
  );
  if (!location[0]) throw new AppError("not_found", "location");
  const rules = await rows<{
    id: string;
    version: number;
    timezone: string;
    buffer_before_minutes: number;
    buffer_after_minutes: number;
    slot_minutes: number;
    opening_hours: unknown;
    adult_seating: "not_required" | "required" | "unconfigured";
    cancellation_policy: string | null;
    business_decisions_confirmed: boolean;
    fixture: boolean;
  }>(
    tx,
    sql`
      select id, version, timezone, buffer_before_minutes, buffer_after_minutes, slot_minutes,
             opening_hours, adult_seating, cancellation_policy, business_decisions_confirmed, fixture
      from venue_rules
      where location_id = ${locationId} and status = 'published'
    `,
  );
  const rule = rules[0];
  if (!rule) throw new AppError("incomplete_rules", "no_published_rules");
  const combinations = await rows<{
    id: string;
    name: string;
    min_children: number;
    max_children: number;
    min_adults: number;
    max_adults: number;
    resource_ids: string[] | null;
  }>(
    tx,
    sql`
      select c.id, c.name, c.min_children, c.max_children, c.min_adults, c.max_adults,
             coalesce(array_agg(cr.resource_id) filter (where cr.resource_id is not null), '{}') as resource_ids
      from combinations c
      left join combination_resources cr on cr.combination_id = c.id
      where c.location_id = ${locationId} and c.status = 'active'
      group by c.id
    `,
  );
  const openingHours = openingHoursSchema.parse(rule.opening_hours);
  assertCanUsePublishedRule(
    {
      timezone: rule.timezone,
      openingHours,
      bufferBeforeMinutes: rule.buffer_before_minutes,
      bufferAfterMinutes: rule.buffer_after_minutes,
      slotMinutes: rule.slot_minutes,
      combinationCount: combinations.length,
      adultSeating: rule.adult_seating,
      cancellationPolicy: rule.cancellation_policy,
      businessDecisionsConfirmed: rule.business_decisions_confirmed,
      fixture: rule.fixture,
    },
    process.env.NODE_ENV ?? "development",
  );
  if (rule.adult_seating === "unconfigured") {
    throw new AppError("incomplete_rules", "adult_seating");
  }
  const packages = await rows<{
    id: string;
    name: string;
    duration_minutes: number;
    price_minor: number;
    currency: string;
    min_children: number;
    max_children: number;
  }>(
    tx,
    sql`
      select id, name, duration_minutes, price_minor, currency, min_children, max_children
      from packages
      where id = ${packageId} and location_id = ${locationId} and status = 'active'
    `,
  );
  const pkg = packages[0];
  if (!pkg) throw new AppError("not_found", "package");
  const resources = await rows<{
    id: string;
    name: string;
    capacity_children: number;
    capacity_adults: number;
    status: string;
  }>(
    tx,
    sql`
      select id, name, capacity_children, capacity_adults, status
      from resources where location_id = ${locationId}
    `,
  );
  const day = parseVenueLocal(localDate, "12:00", rule.timezone);
  const windowStart = day.startOf("day").minus({ hours: 6 }).toJSDate();
  const windowEnd = day.endOf("day").plus({ hours: 6 }).toJSDate();
  const exclude = options?.excludeReservationId ?? null;
  const occupancy = await rows<{ resource_id: string; start_at: Date; end_at: Date }>(
    tx,
    sql`
      select resource_id, lower(occupancy) as start_at, upper(occupancy) as end_at
      from allocations
      where location_id = ${locationId}
        and occupancy && tstzrange(${windowStart.toISOString()}::timestamptz, ${windowEnd.toISOString()}::timestamptz, '[)')
        and (${exclude}::uuid is null or reservation_id <> ${exclude}::uuid)
    `,
  );
  const closures = await rows<{ id: string }>(
    tx,
    sql`
      select id from closures
      where location_id = ${locationId}
        and starts_on <= ${localDate}::date
        and ends_on >= ${localDate}::date
    `,
  );
  return {
    rule: {
      id: rule.id,
      version: rule.version,
      timezone: rule.timezone,
      bufferBefore: rule.buffer_before_minutes,
      bufferAfter: rule.buffer_after_minutes,
      slotMinutes: rule.slot_minutes,
      openingHours,
      adultSeating: rule.adult_seating,
    },
    pkg: {
      id: pkg.id,
      name: pkg.name,
      durationMinutes: pkg.duration_minutes,
      priceMinor: pkg.price_minor,
      currency: pkg.currency.trim(),
      minChildren: pkg.min_children,
      maxChildren: pkg.max_children,
    },
    combinations: combinations.map((row) => ({
      id: row.id,
      name: row.name,
      minChildren: row.min_children,
      maxChildren: row.max_children,
      minAdults: row.min_adults,
      maxAdults: row.max_adults,
      resourceIds: row.resource_ids ?? [],
    })),
    resources: resources.map((row) => ({
      id: row.id,
      name: row.name,
      capacityChildren: row.capacity_children,
      capacityAdults: row.capacity_adults,
      active: row.status === "active",
    })),
    occupancy: occupancy.map((row) => ({
      resourceId: row.resource_id,
      start: new Date(row.start_at),
      end: new Date(row.end_at),
    })),
    closed: closures.length > 0,
  };
}

export function openingFor(loaded: Loaded, localDate: string): OpeningHours[keyof OpeningHours] {
  const dt = parseVenueLocal(localDate, "12:00", loaded.rule.timezone);
  return loaded.rule.openingHours[weekdayKey(dt)];
}

export function suggest(
  loaded: Loaded,
  input: BookingDraft,
  allocate: Allocate,
  requestedMinute: number,
): AlternativeSlot[] {
  const opening = openingFor(loaded, input.localDate);
  if (!opening || loaded.closed) return [];
  const duration = loaded.pkg.durationMinutes;
  const alternatives: AlternativeSlot[] = [];
  let checked = 0;
  for (let minute = opening.startMinute; minute + duration <= opening.endMinute; minute += loaded.rule.slotMinutes) {
    if (minute === requestedMinute) continue;
    checked += 1;
    if (checked > 20) break;
    const localTime = formatMinute(minute);
    const start = parseVenueLocal(input.localDate, localTime, loaded.rule.timezone);
    const end = start.plus({ minutes: duration });
    const result = allocate(allocationInput(loaded, input, minute, minute + duration, start, end));
    if (result.ok) {
      alternatives.push({ localTime, combinationName: result.choice.combinationName });
      if (alternatives.length >= 5) break;
    }
  }
  return alternatives;
}

export function allocationInput(
  loaded: Loaded,
  input: BookingDraft,
  startMinute: number,
  endMinute: number,
  start: DateTime,
  end: DateTime,
): AllocationInput {
  return {
    children: input.childrenCount,
    adults: input.adultCount,
    adultSeating: loaded.rule.adultSeating,
    startMinute,
    endMinute,
    opening: openingFor(loaded, input.localDate),
    closed: loaded.closed,
    occupancyStart: start.minus({ minutes: loaded.rule.bufferBefore }).toJSDate(),
    occupancyEnd: end.plus({ minutes: loaded.rule.bufferAfter }).toJSDate(),
    combinations: loaded.combinations,
    resources: loaded.resources,
    occupancy: loaded.occupancy,
  };
}

export async function bumpRate(tx: Tx, tenantId: string, bucketKey: string, limit: number): Promise<void> {
  const counted = await rows<{ count: number }>(
    tx,
    sql`
      insert into rate_buckets (tenant_id, bucket_key, window_start, count)
      values (${tenantId}, ${bucketKey}, date_trunc('minute', now()), 1)
      on conflict (tenant_id, bucket_key, window_start)
      do update set count = rate_buckets.count + 1
      returning count
    `,
  );
  if ((counted[0]?.count ?? 0) > limit) throw new AppError("rate_limited", "rate_limited");
}

export async function readBooking(tx: Tx, reservationId: string | null) {
  if (!reservationId) return null;
  const found = await rows<{
    id: string;
    reference: string;
    status: string;
    version: number;
    local_date: string;
    starts_at: Date;
    location_id: string;
    timezone: string;
  }>(
    tx,
    sql`
      select r.id, r.reference, r.status, r.version, r.local_date::text as local_date,
             r.starts_at, r.location_id, l.timezone
      from reservations r
      join locations l on l.id = r.location_id
      where r.id = ${reservationId}
    `,
  );
  const row = found[0];
  if (!row) return null;
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    version: row.version,
    localDate: row.local_date,
    localTime: DateTime.fromJSDate(new Date(row.starts_at)).setZone(row.timezone).toFormat("HH:mm"),
    locationId: row.location_id,
  };
}
