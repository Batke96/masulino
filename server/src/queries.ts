import type { Action } from "@masulino/contracts";
import { authorize, type ActorContext } from "@masulino/core";
import { rows, withTenant } from "@masulino/database";
import { sql } from "drizzle-orm";

export async function locationsFor(actor: ActorContext) {
  const locations = await withTenant(actor.tenantId, async (tx) =>
    rows<{ id: string; slug: string; name: string; timezone: string }>(
      tx,
      sql`select id, slug, name, timezone from locations where status = 'active' order by name`,
    ),
  );
  const doors: Action[] = [
    "reservations.booking.read",
    "workforce.availability.read",
    "workforce.schedule.read",
    "operations.checklist.read",
    "marketing.audience.read",
    "reporting.booked_value.read",
    "loyalty.ledger.read",
    "core.records.manage",
    "core.settings.read",
    "resources.manage",
  ];
  return locations.filter((location) =>
    doors.some((action) => authorize({ ...actor, locationId: location.id }, action).allow),
  );
}

export async function packagesFor(actor: ActorContext, locationId: string) {
  return withTenant(actor.tenantId, async (tx) =>
    rows<{ id: string; name: string; price_minor: number; currency: string }>(
      tx,
      sql`
        select id, name, price_minor, currency
        from packages
        where location_id = ${locationId} and status = 'active'
        order by name
      `,
    ),
  );
}
