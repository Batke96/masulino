import { AppError } from "@masulino/contracts";
import { insertAudit, requirePermission, type ActorContext } from "@masulino/core";
import { rows, withTenant, type Tx } from "@masulino/database";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { readsOtherPeople, seesDraftPlans } from "./access";
import { locationTimezone, requireModule } from "./db";
import {
  buildProposal,
  weekDates,
  type BookingFact,
  type PlanWarning,
  type ShiftDraft,
} from "./plan";

export type BookingFactsLoader = (args: {
  tx: Tx;
  locationId: string;
  fromDate: string;
  toDate: string;
}) => Promise<BookingFact[]>;

export type ShiftView = ShiftDraft & { id: string; displayName: string | null };

export type PlanView = {
  id: string;
  version: number;
  status: "draft" | "published";
  weekStartsOn: string;
  publicationWeekday: number;
  warnings: PlanWarning[];
  shifts: ShiftView[];
};

function parseWarnings(value: unknown): PlanWarning[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PlanWarning => {
    if (!item || typeof item !== "object" || !("code" in item)) return false;
    const code = (item as { code?: unknown }).code;
    return code === "coverage_gap" || code === "overlap" || code === "break";
  });
}

export async function readPublicationWeekday(actor: ActorContext): Promise<number> {
  requirePermission(actor, "workforce.schedule.read");
  return withTenant(actor.tenantId, async (tx) => {
    const found = await rows<{ publication_weekday: number }>(
      tx,
      sql`select publication_weekday from workforce_settings`,
    );
    return found[0]?.publication_weekday ?? 0;
  });
}

export async function proposeWeek(args: {
  actor: ActorContext;
  locationId: string;
  weekStartsOn: string;
  correlationId: string;
  loadBookings: BookingFactsLoader;
}): Promise<{ id: string; version: number; warnings: PlanWarning[] }> {
  requirePermission(args.actor, "workforce.schedule.propose", args.locationId);
  weekDates(args.weekStartsOn);
  const id = randomUUID();
  let version = 1;
  let warnings: PlanWarning[] = [];
  await withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "workforce");
    await locationTimezone(tx, args.locationId);
    await tx.execute(sql`
      insert into workforce_settings (tenant_id, publication_weekday)
      values (${args.actor.tenantId}, 0)
      on conflict (tenant_id) do nothing
    `);
    const settings = await rows<{ publication_weekday: number }>(
      tx,
      sql`select publication_weekday from workforce_settings`,
    );
    const publicationWeekday = settings[0]?.publication_weekday ?? 0;
    const dates = weekDates(args.weekStartsOn);
    const fromDate = dates[0];
    const toDate = dates[6];
    if (!fromDate || !toDate) throw new AppError("validation", "week_start");
    const bookings = await args.loadBookings({
      tx,
      locationId: args.locationId,
      fromDate,
      toDate,
    });
    const windows = await rows<{
      principal_id: string;
      weekday: number;
      start_minute: number;
      end_minute: number;
    }>(
      tx,
      sql`
        select r.principal_id, w.weekday, w.start_minute, w.end_minute
        from availability_revisions r
        join availability_windows w on w.revision_id = r.id
        where r.location_id = ${args.locationId}
          and r.version = (
            select max(newer.version) from availability_revisions newer
            where newer.location_id = r.location_id and newer.principal_id = r.principal_id
          )
      `,
    );
    const leave = await rows<{
      principal_id: string;
      starts_on: string;
      ends_on: string;
    }>(
      tx,
      sql`
        select principal_id, starts_on::text as starts_on, ends_on::text as ends_on
        from leave_entries l
        where location_id = ${args.locationId}
          and not exists (select 1 from leave_entries newer where newer.previous_id = l.id)
      `,
    );
    const proposal = buildProposal({
      weekStartsOn: args.weekStartsOn,
      windows: windows.map((row) => ({
        principalId: row.principal_id,
        weekday: row.weekday,
        startMinute: row.start_minute,
        endMinute: row.end_minute,
      })),
      leave: leave.map((row) => ({
        principalId: row.principal_id,
        startsOn: row.starts_on.slice(0, 10),
        endsOn: row.ends_on.slice(0, 10),
      })),
      bookings,
    });
    warnings = proposal.warnings;
    const locked = await rows<{ version: number }>(
      tx,
      sql`
        select version from schedule_plans
        where location_id = ${args.locationId} and week_starts_on = ${args.weekStartsOn}::date
        order by version desc
        limit 1
        for update
      `,
    );
    version = (locked[0]?.version ?? 0) + 1;
    await tx.execute(sql`
      insert into schedule_plans (
        id, tenant_id, location_id, week_starts_on, version, status, publication_weekday, warnings,
        created_by_principal_id
      ) values (
        ${id}, ${args.actor.tenantId}, ${args.locationId}, ${args.weekStartsOn}::date, ${version},
        'draft', ${publicationWeekday}, ${JSON.stringify(proposal.warnings)}::jsonb, ${args.actor.principalId}
      )
    `);
    for (const shift of proposal.shifts) {
      await tx.execute(sql`
        insert into schedule_shifts (
          tenant_id, plan_id, location_id, principal_id, local_date, start_minute, end_minute, break_minutes
        ) values (
          ${args.actor.tenantId}, ${id}, ${args.locationId}, ${shift.principalId}, ${shift.localDate}::date,
          ${shift.startMinute}, ${shift.endMinute}, ${shift.breakMinutes}
        )
      `);
    }
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: args.locationId,
      actorPrincipalId: args.actor.principalId,
      action: "workforce.schedule.propose",
      targetType: "schedule_plan",
      targetId: id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { version, status: "draft" },
    });
  });
  return { id, version, warnings };
}

export async function publishPlan(args: {
  actor: ActorContext;
  planId: string;
  correlationId: string;
}): Promise<{ id: string; version: number; idempotent: boolean }> {
  let version = 0;
  let idempotent = false;
  await withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "workforce");
    const found = await rows<{
      id: string;
      location_id: string;
      status: string;
      version: number;
    }>(
      tx,
      sql`select id, location_id, status, version from schedule_plans where id = ${args.planId} for update`,
    );
    const plan = found[0];
    if (!plan) throw new AppError("not_found", "plan");
    requirePermission(args.actor, "workforce.schedule.publish", plan.location_id);
    version = plan.version;
    if (plan.status === "published") {
      idempotent = true;
      return;
    }
    if (plan.status !== "draft") throw new AppError("conflict", "plan_state");
    const updated = await rows<{ id: string }>(
      tx,
      sql`
        update schedule_plans
        set status = 'published', published_at = now(), published_by_principal_id = ${args.actor.principalId}
        where id = ${plan.id} and status = 'draft'
        returning id
      `,
    );
    if (!updated[0]) throw new AppError("conflict", "plan_state");
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: plan.location_id,
      actorPrincipalId: args.actor.principalId,
      action: "workforce.schedule.publish",
      targetType: "schedule_plan",
      targetId: plan.id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { status: "published", version: plan.version },
    });
  });
  return { id: args.planId, version, idempotent };
}

export async function readWeek(args: {
  actor: ActorContext;
  locationId: string;
  weekStartsOn: string;
}): Promise<{ publicationWeekday: number; draft: PlanView | null; published: PlanView | null }> {
  requirePermission(args.actor, "workforce.schedule.read", args.locationId);
  const includeDraft = seesDraftPlans(args.actor, args.locationId);
  const ownOnly = !readsOtherPeople(args.actor, "workforce.schedule.read", args.locationId);
  return withTenant(args.actor.tenantId, async (tx) => {
    const settings = await rows<{ publication_weekday: number }>(
      tx,
      sql`select publication_weekday from workforce_settings`,
    );
    const publicationWeekday = settings[0]?.publication_weekday ?? 0;
    const published = await loadPlan(tx, args.locationId, args.weekStartsOn, "published", args.actor.principalId, ownOnly);
    const draft = includeDraft
      ? await loadPlan(tx, args.locationId, args.weekStartsOn, "draft", args.actor.principalId, false)
      : null;
    return { publicationWeekday, draft, published };
  });
}

async function loadPlan(
  tx: Tx,
  locationId: string,
  weekStartsOn: string,
  status: "draft" | "published",
  principalId: string,
  ownOnly: boolean,
): Promise<PlanView | null> {
  const plans = await rows<{
    id: string;
    version: number;
    status: "draft" | "published";
    week_starts_on: string;
    publication_weekday: number;
    warnings: unknown;
  }>(
    tx,
    sql`
      select id, version, status, week_starts_on::text as week_starts_on, publication_weekday, warnings
      from schedule_plans
      where location_id = ${locationId}
        and week_starts_on = ${weekStartsOn}::date
        and status = ${status}
      order by version desc
      limit 1
    `,
  );
  const plan = plans[0];
  if (!plan) return null;
  const shifts = await rows<{
    id: string;
    principal_id: string;
    display_name: string | null;
    local_date: string;
    start_minute: number;
    end_minute: number;
    break_minutes: number;
  }>(
    tx,
    sql`
      select s.id, s.principal_id, p.display_name, s.local_date::text as local_date,
             s.start_minute, s.end_minute, s.break_minutes
      from schedule_shifts s
      left join principals p on p.id = s.principal_id
      where s.plan_id = ${plan.id}
        and (${ownOnly}::boolean = false or s.principal_id = ${principalId})
      order by s.local_date, s.start_minute
    `,
  );
  return {
    id: plan.id,
    version: plan.version,
    status: plan.status,
    weekStartsOn: plan.week_starts_on.slice(0, 10),
    publicationWeekday: plan.publication_weekday,
    warnings: parseWarnings(plan.warnings),
    shifts: shifts.map((shift) => ({
      id: shift.id,
      principalId: shift.principal_id,
      displayName: shift.display_name,
      localDate: shift.local_date.slice(0, 10),
      startMinute: shift.start_minute,
      endMinute: shift.end_minute,
      breakMinutes: shift.break_minutes,
    })),
  };
}
