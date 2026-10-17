import {
  AppError,
  type ClosureRecordInput,
  type CombinationRecordInput,
  type PackageRecordInput,
  type ResourceRecordInput,
  type VenueSlugRecordInput,
} from "@masulino/contracts";
import { insertAudit, requirePermission, type ActorContext } from "@masulino/core";
import { pgCode, rows, withTenant, type Tx } from "@masulino/database";
import { sql } from "drizzle-orm";

/**
 * Fixed venue catalog. Writes require core.records.manage, then run inside withTenant, then insert an audit row.
 * This service does not publish venue rules and never writes business_decisions_confirmed.
 * Rule publication stays on assertCanUsePublishedRule.
 */

export type VenueCatalog = {
  packages: Array<{
    id: string;
    name: string;
    publicCode: string | null;
    priceMinor: number;
    currency: string;
    durationMinutes: number;
    status: "active" | "inactive";
  }>;
  resources: Array<{
    id: string;
    name: string;
    capacityChildren: number;
    status: "active" | "inactive";
  }>;
  combinations: Array<{
    id: string;
    name: string;
    minChildren: number;
    maxChildren: number;
    maxAdults: number;
    status: "active" | "inactive";
    resourceIds: string[];
  }>;
  closures: Array<{
    id: string;
    startsOn: string;
    endsOn: string;
    reason: string;
  }>;
  venue: { publicSlug: string; status: string } | null;
};

export async function listCatalog(actor: ActorContext, locationId: string): Promise<VenueCatalog> {
  requirePermission(actor, "core.records.manage", locationId);
  return withTenant(actor.tenantId, async (tx) => {
    const location = await rows<{ id: string }>(
      tx,
      sql`select id from locations where id = ${locationId} and status = 'active'`,
    );
    if (!location[0]) throw new AppError("not_found", "location");
    const packages = await rows<{
      id: string;
      name: string;
      public_code: string | null;
      price_minor: number;
      currency: string;
      duration_minutes: number;
      status: "active" | "inactive";
    }>(
      tx,
      sql`
        select id, name, public_code, price_minor, currency, duration_minutes, status
        from packages
        where location_id = ${locationId}
        order by name
      `,
    );
    const resources = await rows<{
      id: string;
      name: string;
      capacity_children: number;
      status: "active" | "inactive";
    }>(
      tx,
      sql`
        select id, name, capacity_children, status
        from resources
        where location_id = ${locationId}
        order by name
      `,
    );
    const combinations = await rows<{
      id: string;
      name: string;
      min_children: number;
      max_children: number;
      max_adults: number;
      status: "active" | "inactive";
    }>(
      tx,
      sql`
        select id, name, min_children, max_children, max_adults, status
        from combinations
        where location_id = ${locationId}
        order by name
      `,
    );
    const links = combinations.length
      ? await rows<{ combination_id: string; resource_id: string }>(
          tx,
          sql`
            select combination_id, resource_id
            from combination_resources
            where combination_id in (${sql.join(
              combinations.map((row) => sql`${row.id}`),
              sql`, `,
            )})
            order by resource_id
          `,
        )
      : [];
    const closures = await rows<{ id: string; starts_on: string; ends_on: string; reason: string }>(
      tx,
      sql`
        select id, starts_on::text as starts_on, ends_on::text as ends_on, reason
        from closures
        where location_id = ${locationId}
        order by starts_on, reason
      `,
    );
    const venues = await rows<{ public_slug: string; status: string }>(
      tx,
      sql`
        select public_slug, status
        from published_venues
        where location_id = ${locationId}
      `,
    );
    const venue = venues[0];
    return {
      packages: packages.map((row) => ({
        id: row.id,
        name: row.name,
        publicCode: row.public_code,
        priceMinor: row.price_minor,
        currency: row.currency.trim(),
        durationMinutes: row.duration_minutes,
        status: row.status,
      })),
      resources: resources.map((row) => ({
        id: row.id,
        name: row.name,
        capacityChildren: row.capacity_children,
        status: row.status,
      })),
      combinations: combinations.map((row) => ({
        id: row.id,
        name: row.name,
        minChildren: row.min_children,
        maxChildren: row.max_children,
        maxAdults: row.max_adults,
        status: row.status,
        resourceIds: links.filter((link) => link.combination_id === row.id).map((link) => link.resource_id),
      })),
      closures: closures.map((row) => ({
        id: row.id,
        startsOn: row.starts_on,
        endsOn: row.ends_on,
        reason: row.reason,
      })),
      venue: venue ? { publicSlug: venue.public_slug, status: venue.status } : null,
    };
  });
}

async function assertLocation(tx: Tx, locationId: string): Promise<void> {
  const location = await rows<{ id: string }>(
    tx,
    sql`select id from locations where id = ${locationId} and status = 'active'`,
  );
  if (!location[0]) throw new AppError("not_found", "location");
}

export async function updatePackageRecord(args: {
  actor: ActorContext;
  input: PackageRecordInput;
  correlationId: string;
}): Promise<void> {
  requirePermission(args.actor, "core.records.manage", args.input.locationId);
  try {
    await withTenant(args.actor.tenantId, async (tx) => {
      await assertLocation(tx, args.input.locationId);
      const updated = await rows<{ id: string }>(
        tx,
        sql`
          update packages
          set public_code = ${args.input.publicCode},
              price_minor = ${args.input.priceMinor},
              duration_minutes = ${args.input.durationMinutes},
              status = ${args.input.status}
          where id = ${args.input.packageId} and location_id = ${args.input.locationId}
          returning id
        `,
      );
      if (!updated[0]) throw new AppError("not_found", "package");
      await insertAudit(tx, {
        tenantId: args.actor.tenantId,
        locationId: args.input.locationId,
        actorPrincipalId: args.actor.principalId,
        action: "core.records.manage",
        targetType: "package",
        targetId: args.input.packageId,
        outcome: "success",
        correlationId: args.correlationId,
        changes: {
          publicCode: args.input.publicCode,
          priceMinor: args.input.priceMinor,
          durationMinutes: args.input.durationMinutes,
          status: args.input.status,
        },
      });
    });
  } catch (error) {
    if (pgCode(error) === "23505" || pgCode(error) === "23514") {
      throw new AppError("conflict", "public_code");
    }
    throw error;
  }
}

export async function updateResourceRecord(args: {
  actor: ActorContext;
  input: ResourceRecordInput;
  correlationId: string;
}): Promise<void> {
  requirePermission(args.actor, "core.records.manage", args.input.locationId);
  await withTenant(args.actor.tenantId, async (tx) => {
    await assertLocation(tx, args.input.locationId);
    const updated = await rows<{ id: string }>(
      tx,
      sql`
        update resources
        set name = ${args.input.name},
            capacity_children = ${args.input.capacityChildren},
            status = ${args.input.status}
        where id = ${args.input.resourceId} and location_id = ${args.input.locationId}
        returning id
      `,
    );
    if (!updated[0]) throw new AppError("not_found", "resource");
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: args.input.locationId,
      actorPrincipalId: args.actor.principalId,
      action: "core.records.manage",
      targetType: "resource",
      targetId: args.input.resourceId,
      outcome: "success",
      correlationId: args.correlationId,
      changes: {
        name: args.input.name,
        capacityChildren: args.input.capacityChildren,
        status: args.input.status,
      },
    });
  });
}

export async function updateCombinationRecord(args: {
  actor: ActorContext;
  input: CombinationRecordInput;
  correlationId: string;
}): Promise<void> {
  requirePermission(args.actor, "core.records.manage", args.input.locationId);
  await withTenant(args.actor.tenantId, async (tx) => {
    await assertLocation(tx, args.input.locationId);
    const updated = await rows<{ id: string }>(
      tx,
      sql`
        update combinations
        set name = ${args.input.name},
            min_children = ${args.input.minChildren},
            max_children = ${args.input.maxChildren},
            max_adults = ${args.input.maxAdults},
            status = ${args.input.status}
        where id = ${args.input.combinationId} and location_id = ${args.input.locationId}
        returning id
      `,
    );
    if (!updated[0]) throw new AppError("not_found", "combination");
    const uniqueIds = [...new Set(args.input.resourceIds)];
    const found = await rows<{ id: string }>(
      tx,
      sql`
        select id from resources
        where location_id = ${args.input.locationId}
          and id in (${sql.join(
            uniqueIds.map((id) => sql`${id}`),
            sql`, `,
          )})
      `,
    );
    if (found.length !== uniqueIds.length) throw new AppError("validation", "resource");
    await tx.execute(sql`
      delete from combination_resources
      where combination_id = ${args.input.combinationId}
        and tenant_id = ${args.actor.tenantId}
    `);
    for (const resourceId of uniqueIds) {
      await tx.execute(sql`
        insert into combination_resources (tenant_id, combination_id, resource_id)
        values (${args.actor.tenantId}, ${args.input.combinationId}, ${resourceId})
      `);
    }
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: args.input.locationId,
      actorPrincipalId: args.actor.principalId,
      action: "core.records.manage",
      targetType: "combination",
      targetId: args.input.combinationId,
      outcome: "success",
      correlationId: args.correlationId,
      changes: {
        name: args.input.name,
        minChildren: args.input.minChildren,
        maxChildren: args.input.maxChildren,
        maxAdults: args.input.maxAdults,
        status: args.input.status,
        resourceCount: uniqueIds.length,
      },
    });
  });
}

export async function addClosure(args: {
  actor: ActorContext;
  input: ClosureRecordInput;
  correlationId: string;
}): Promise<{ id: string }> {
  requirePermission(args.actor, "core.records.manage", args.input.locationId);
  return withTenant(args.actor.tenantId, async (tx) => {
    await assertLocation(tx, args.input.locationId);
    const inserted = await rows<{ id: string }>(
      tx,
      sql`
        insert into closures (tenant_id, location_id, starts_on, ends_on, reason)
        values (
          ${args.actor.tenantId}, ${args.input.locationId}, ${args.input.startsOn}::date,
          ${args.input.endsOn}::date, ${args.input.reason}
        )
        returning id
      `,
    );
    const created = inserted[0];
    if (!created) throw new AppError("validation", "closure");
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: args.input.locationId,
      actorPrincipalId: args.actor.principalId,
      action: "core.records.manage",
      targetType: "closure",
      targetId: created.id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: {
        startsOn: args.input.startsOn,
        endsOn: args.input.endsOn,
        reason: args.input.reason,
      },
    });
    return { id: created.id };
  });
}

export async function updatePublishedSlug(args: {
  actor: ActorContext;
  input: VenueSlugRecordInput;
  correlationId: string;
}): Promise<void> {
  requirePermission(args.actor, "core.records.manage", args.input.locationId);
  try {
    await withTenant(args.actor.tenantId, async (tx) => {
      await assertLocation(tx, args.input.locationId);
      const updated = await rows<{ id: string }>(
        tx,
        sql`
          update published_venues
          set public_slug = ${args.input.publicSlug}
          where location_id = ${args.input.locationId}
          returning id
        `,
      );
      if (!updated[0]) throw new AppError("not_found", "published_venue");
      await insertAudit(tx, {
        tenantId: args.actor.tenantId,
        locationId: args.input.locationId,
        actorPrincipalId: args.actor.principalId,
        action: "core.records.manage",
        targetType: "published_venue",
        targetId: updated[0].id,
        outcome: "success",
        correlationId: args.correlationId,
        changes: { publicSlug: args.input.publicSlug },
      });
    });
  } catch (error) {
    if (pgCode(error) === "23505") throw new AppError("conflict", "public_slug");
    throw error;
  }
}
