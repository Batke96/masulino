import type { AssignChecklistInput, OpenIssueInput } from "@masulino/contracts";
import { AppError } from "@masulino/contracts";
import { insertAudit, requirePermission, type ActorContext } from "@masulino/core";
import { rows, withTenant, type Tx } from "@masulino/database";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { readsOtherPeople } from "./access";

async function operationsEnabled(tx: Tx): Promise<boolean> {
  const found = await rows<{ enabled: boolean }>(
    tx,
    sql`select enabled from module_entitlements where module_id = 'operations'`,
  );
  return found[0]?.enabled === true;
}

function assignedToActor(
  actor: ActorContext,
  list: { location_id: string; assignee_principal_id: string | null; assignee_role_key: string | null },
): boolean {
  if (list.assignee_principal_id === actor.principalId) return true;
  if (!list.assignee_role_key) return false;
  return actor.grants.some(
    (grant) =>
      grant.roleKey === list.assignee_role_key &&
      (grant.locationId === null || grant.locationId === list.location_id),
  );
}

export type ChecklistView = {
  id: string;
  kind: string;
  localDate: string;
  title: string;
  assigneePrincipalId: string | null;
  assigneeRoleKey: string | null;
  completedAt: string | null;
  completedBy: string | null;
  note: string | null;
};

export type IssueView = {
  id: string;
  description: string;
  status: string;
  checklistId: string | null;
};

export async function assignChecklist(args: {
  actor: ActorContext;
  input: AssignChecklistInput;
  correlationId: string;
}): Promise<{ id: string }> {
  requirePermission(args.actor, "operations.checklist.manage", args.input.locationId);
  const id = randomUUID();
  await withTenant(args.actor.tenantId, async (tx) => {
    if (!(await operationsEnabled(tx))) throw new AppError("forbidden", "entitlement");
    const location = await rows<{ id: string }>(
      tx,
      sql`select id from locations where id = ${args.input.locationId} and status = 'active'`,
    );
    if (!location[0]) throw new AppError("not_found", "location");
    await tx.execute(sql`
      insert into checklists (
        id, tenant_id, location_id, kind, local_date, title, assignee_principal_id, assignee_role_key,
        created_by_principal_id
      ) values (
        ${id}, ${args.actor.tenantId}, ${args.input.locationId}, ${args.input.kind},
        ${args.input.localDate}::date, ${args.input.title}, ${args.input.assigneePrincipalId ?? null},
        ${args.input.assigneeRoleKey ?? null}, ${args.actor.principalId}
      )
    `);
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: args.input.locationId,
      actorPrincipalId: args.actor.principalId,
      action: "operations.checklist.assign",
      targetType: "checklist",
      targetId: id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { kind: args.input.kind, localDate: args.input.localDate },
    });
  });
  return { id };
}

export async function listChecklists(actor: ActorContext, locationId: string): Promise<ChecklistView[]> {
  requirePermission(actor, "operations.checklist.read", locationId);
  const others = readsOtherPeople(actor, "operations.checklist.read", locationId);
  return withTenant(actor.tenantId, async (tx) => {
    const found = await rows<{
      id: string;
      kind: string;
      local_date: string;
      title: string;
      assignee_principal_id: string | null;
      assignee_role_key: string | null;
      location_id: string;
      completed_at: Date | null;
      actor_principal_id: string | null;
      note: string | null;
    }>(
      tx,
      sql`
        select c.id, c.kind, c.local_date::text as local_date, c.title, c.assignee_principal_id,
               c.assignee_role_key, c.location_id, k.completed_at, k.actor_principal_id, k.note
        from checklists c
        left join checklist_completions k on k.checklist_id = c.id
        where c.location_id = ${locationId}
        order by c.local_date, c.title
      `,
    );
    return found
      .filter((row) => others || assignedToActor(actor, row))
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        localDate: row.local_date.slice(0, 10),
        title: row.title,
        assigneePrincipalId: row.assignee_principal_id,
        assigneeRoleKey: row.assignee_role_key,
        completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
        completedBy: row.actor_principal_id,
        note: row.note,
      }));
  });
}

export async function completeChecklist(args: {
  actor: ActorContext;
  checklistId: string;
  note: string;
  correlationId: string;
}): Promise<{ id: string }> {
  let id: string = randomUUID();
  await withTenant(args.actor.tenantId, async (tx) => {
    if (!(await operationsEnabled(tx))) throw new AppError("forbidden", "entitlement");
    const found = await rows<{
      id: string;
      location_id: string;
      assignee_principal_id: string | null;
      assignee_role_key: string | null;
    }>(
      tx,
      sql`
        select id, location_id, assignee_principal_id, assignee_role_key
        from checklists where id = ${args.checklistId}
      `,
    );
    const list = found[0];
    if (!list) throw new AppError("not_found", "checklist");
    requirePermission(args.actor, "operations.checklist.complete", list.location_id);
    const others = readsOtherPeople(args.actor, "operations.checklist.complete", list.location_id);
    if (!others && !assignedToActor(args.actor, list)) throw new AppError("forbidden", "permission");
    const existing = await rows<{ id: string }>(
      tx,
      sql`select id from checklist_completions where checklist_id = ${list.id}`,
    );
    const already = existing[0];
    if (already) {
      id = already.id;
      return;
    }
    await tx.execute(sql`
      insert into checklist_completions (
        id, tenant_id, location_id, checklist_id, actor_principal_id, completed_at, note
      ) values (
        ${id}, ${args.actor.tenantId}, ${list.location_id}, ${list.id}, ${args.actor.principalId}, now(), ${args.note}
      )
    `);
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: list.location_id,
      actorPrincipalId: args.actor.principalId,
      action: "operations.checklist.complete",
      targetType: "checklist",
      targetId: list.id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { completed: true },
    });
  });
  return { id };
}

export async function openIssue(args: {
  actor: ActorContext;
  input: OpenIssueInput;
  correlationId: string;
}): Promise<{ id: string }> {
  requirePermission(args.actor, "operations.checklist.complete", args.input.locationId);
  const id = randomUUID();
  await withTenant(args.actor.tenantId, async (tx) => {
    if (!(await operationsEnabled(tx))) throw new AppError("forbidden", "entitlement");
    await tx.execute(sql`
      insert into checklist_issues (
        id, tenant_id, location_id, checklist_id, description, status, created_by_principal_id
      ) values (
        ${id}, ${args.actor.tenantId}, ${args.input.locationId}, ${args.input.checklistId ?? null},
        ${args.input.description}, 'open', ${args.actor.principalId}
      )
    `);
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: args.input.locationId,
      actorPrincipalId: args.actor.principalId,
      action: "operations.issue.open",
      targetType: "checklist_issue",
      targetId: id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { status: "open" },
    });
  });
  return { id };
}

export async function listIssues(actor: ActorContext, locationId: string): Promise<IssueView[]> {
  requirePermission(actor, "operations.checklist.read", locationId);
  return withTenant(actor.tenantId, async (tx) => {
    const found = await rows<{
      id: string;
      description: string;
      status: string;
      checklist_id: string | null;
    }>(
      tx,
      sql`
        select id, description, status, checklist_id
        from checklist_issues
        where location_id = ${locationId}
        order by created_at
      `,
    );
    return found.map((row) => ({
      id: row.id,
      description: row.description,
      status: row.status,
      checklistId: row.checklist_id,
    }));
  });
}

export async function resolveIssue(args: {
  actor: ActorContext;
  issueId: string;
  correlationId: string;
}): Promise<void> {
  await withTenant(args.actor.tenantId, async (tx) => {
    if (!(await operationsEnabled(tx))) throw new AppError("forbidden", "entitlement");
    const found = await rows<{ id: string; location_id: string; status: string }>(
      tx,
      sql`select id, location_id, status from checklist_issues where id = ${args.issueId} for update`,
    );
    const issue = found[0];
    if (!issue) throw new AppError("not_found", "issue");
    requirePermission(args.actor, "operations.checklist.manage", issue.location_id);
    if (issue.status === "resolved") return;
    const updated = await rows<{ id: string }>(
      tx,
      sql`
        update checklist_issues
        set status = 'resolved', resolved_at = now(), resolved_by_principal_id = ${args.actor.principalId}
        where id = ${issue.id} and status = 'open'
        returning id
      `,
    );
    if (!updated[0]) throw new AppError("conflict", "issue_state");
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: issue.location_id,
      actorPrincipalId: args.actor.principalId,
      action: "operations.issue.resolve",
      targetType: "checklist_issue",
      targetId: issue.id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { status: "resolved" },
    });
  });
}
