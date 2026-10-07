import type { RecordLeaveInput, SaveAvailabilityInput } from "@masulino/contracts";
import { AppError } from "@masulino/contracts";
import { insertAudit, requirePermission, type ActorContext } from "@masulino/core";
import { rows, withTenant } from "@masulino/database";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { allows, readsOtherPeople } from "./access";
import { moduleEnabled, requireModule } from "./db";

export type AvailabilityView = {
  principalId: string;
  displayName: string | null;
  version: number;
  windows: Array<{ weekday: number; startMinute: number; endMinute: number }>;
};

export type LeaveView = {
  id: string;
  principalId: string;
  displayName: string | null;
  startsOn: string;
  endsOn: string;
  status: string;
  reason: string;
  previousId: string | null;
  current: boolean;
};

export async function saveAvailability(args: {
  actor: ActorContext;
  input: SaveAvailabilityInput;
  correlationId: string;
}): Promise<{ id: string; version: number }> {
  requirePermission(args.actor, "workforce.availability.write", args.input.locationId);
  const id = randomUUID();
  let version = 1;
  await withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "workforce");
    const current = await rows<{ version: number }>(
      tx,
      sql`
        select version from availability_revisions
        where location_id = ${args.input.locationId} and principal_id = ${args.actor.principalId}
        order by version desc
        limit 1
      `,
    );
    version = (current[0]?.version ?? 0) + 1;
    await tx.execute(sql`
      insert into availability_revisions (
        id, tenant_id, location_id, principal_id, version, created_by_principal_id
      ) values (
        ${id}, ${args.actor.tenantId}, ${args.input.locationId}, ${args.actor.principalId},
        ${version}, ${args.actor.principalId}
      )
    `);
    for (const window of args.input.windows) {
      await tx.execute(sql`
        insert into availability_windows (tenant_id, revision_id, weekday, start_minute, end_minute)
        values (
          ${args.actor.tenantId}, ${id}, ${window.weekday}, ${window.startMinute}, ${window.endMinute}
        )
      `);
    }
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: args.input.locationId,
      actorPrincipalId: args.actor.principalId,
      action: "workforce.availability.write",
      targetType: "availability_revision",
      targetId: id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { version },
    });
  });
  return { id, version };
}

export async function recordLeave(args: {
  actor: ActorContext;
  input: RecordLeaveInput;
  correlationId: string;
}): Promise<{ id: string }> {
  requirePermission(args.actor, "workforce.availability.write", args.input.locationId);
  const id = randomUUID();
  await withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "workforce");
    if (args.input.previousId) {
      const previous = await rows<{ id: string }>(
        tx,
        sql`
          select id from leave_entries
          where id = ${args.input.previousId}
            and principal_id = ${args.actor.principalId}
            and location_id = ${args.input.locationId}
        `,
      );
      if (!previous[0]) throw new AppError("not_found", "leave");
    }
    await tx.execute(sql`
      insert into leave_entries (
        id, tenant_id, location_id, principal_id, starts_on, ends_on, status, reason, previous_id,
        created_by_principal_id
      ) values (
        ${id}, ${args.actor.tenantId}, ${args.input.locationId}, ${args.actor.principalId},
        ${args.input.startsOn}::date, ${args.input.endsOn}::date, ${args.input.status}, ${args.input.reason},
        ${args.input.previousId ?? null}, ${args.actor.principalId}
      )
    `);
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: args.input.locationId,
      actorPrincipalId: args.actor.principalId,
      action: "workforce.leave.write",
      targetType: "leave_entry",
      targetId: id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { status: args.input.status, startsOn: args.input.startsOn, endsOn: args.input.endsOn },
    });
  });
  return { id };
}

export async function readAvailability(
  actor: ActorContext,
  locationId: string,
  principalId = actor.principalId,
): Promise<AvailabilityView | null> {
  requirePermission(actor, "workforce.availability.read", locationId);
  if (principalId !== actor.principalId && !readsOtherPeople(actor, "workforce.availability.read", locationId)) {
    throw new AppError("forbidden", "permission");
  }
  return withTenant(actor.tenantId, async (tx) => {
    if (!(await moduleEnabled(tx, "workforce"))) return null;
    const rowsForPerson = await loadAvailability(tx, locationId, principalId);
    return rowsForPerson[0] ?? null;
  });
}

export async function listLocationAvailability(
  actor: ActorContext,
  locationId: string,
): Promise<AvailabilityView[]> {
  requirePermission(actor, "workforce.availability.read", locationId);
  if (!readsOtherPeople(actor, "workforce.availability.read", locationId)) {
    throw new AppError("forbidden", "permission");
  }
  return withTenant(actor.tenantId, async (tx) => {
    if (!(await moduleEnabled(tx, "workforce"))) return [];
    return loadAvailability(tx, locationId, null);
  });
}

async function loadAvailability(
  tx: Parameters<typeof rows>[0],
  locationId: string,
  principalId: string | null,
): Promise<AvailabilityView[]> {
  const found = await rows<{
    principal_id: string;
    display_name: string | null;
    version: number;
    weekday: number;
    start_minute: number;
    end_minute: number;
  }>(
    tx,
    sql`
      select r.principal_id, p.display_name, r.version, w.weekday, w.start_minute, w.end_minute
      from availability_revisions r
      join availability_windows w on w.revision_id = r.id
      left join principals p on p.id = r.principal_id
      where r.location_id = ${locationId}
        and (${principalId}::uuid is null or r.principal_id = ${principalId}::uuid)
        and r.version = (
          select max(newer.version) from availability_revisions newer
          where newer.location_id = r.location_id and newer.principal_id = r.principal_id
        )
      order by r.principal_id, w.weekday, w.start_minute
    `,
  );
  const grouped = new Map<string, AvailabilityView>();
  for (const row of found) {
    const current = grouped.get(row.principal_id) ?? {
      principalId: row.principal_id,
      displayName: row.display_name,
      version: row.version,
      windows: [],
    };
    current.windows.push({
      weekday: row.weekday,
      startMinute: row.start_minute,
      endMinute: row.end_minute,
    });
    grouped.set(row.principal_id, current);
  }
  return [...grouped.values()];
}

export async function listLeave(actor: ActorContext, locationId: string): Promise<LeaveView[]> {
  requirePermission(actor, "workforce.availability.read", locationId);
  const others = readsOtherPeople(actor, "workforce.availability.read", locationId);
  return withTenant(actor.tenantId, async (tx) => {
    if (!(await moduleEnabled(tx, "workforce"))) return [];
    const found = await rows<{
      id: string;
      principal_id: string;
      display_name: string | null;
      starts_on: string;
      ends_on: string;
      status: string;
      reason: string;
      previous_id: string | null;
      current: boolean;
    }>(
      tx,
      sql`
        select l.id, l.principal_id, p.display_name, l.starts_on::text as starts_on, l.ends_on::text as ends_on,
               l.status, l.reason, l.previous_id,
               not exists (select 1 from leave_entries newer where newer.previous_id = l.id) as current
        from leave_entries l
        left join principals p on p.id = l.principal_id
        where l.location_id = ${locationId}
          and (${others}::boolean or l.principal_id = ${actor.principalId})
        order by l.created_at
      `,
    );
    return found.map((row) => ({
      id: row.id,
      principalId: row.principal_id,
      displayName: row.display_name,
      startsOn: row.starts_on.slice(0, 10),
      endsOn: row.ends_on.slice(0, 10),
      status: row.status,
      reason: row.reason,
      previousId: row.previous_id,
      current: row.current,
    }));
  });
}

export function canReadLocationAvailability(actor: ActorContext, locationId: string): boolean {
  return allows(actor, "workforce.availability.read", locationId) && readsOtherPeople(actor, "workforce.availability.read", locationId);
}
