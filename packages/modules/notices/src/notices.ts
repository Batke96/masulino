import { AppError, type NoticeDraftInput } from "@masulino/contracts";
import { insertAudit, requirePermission, type ActorContext } from "@masulino/core";
import { rows, withTenant, type Tx } from "@masulino/database";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { sanitizeNoticeText } from "./sanitize";

export type NoticeRow = {
  id: string;
  title: string;
  body: string;
  startsOn: string;
  endsOn: string;
  status: string;
};

function mapNotice(row: {
  id: string;
  title: string;
  body: string;
  starts_on: string;
  ends_on: string;
  status: string;
}): NoticeRow {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    startsOn: String(row.starts_on).slice(0, 10),
    endsOn: String(row.ends_on).slice(0, 10),
    status: row.status,
  };
}

async function contentEnabled(tx: Tx): Promise<boolean> {
  const found = await rows<{ enabled: boolean }>(
    tx,
    sql`select enabled from module_entitlements where module_id = 'content'`,
  );
  return found[0]?.enabled === true;
}

export async function createNotice(args: {
  actor: ActorContext;
  input: NoticeDraftInput;
  correlationId: string;
}): Promise<{ id: string }> {
  requirePermission(args.actor, "content.notice.manage", args.input.locationId);
  const title = sanitizeNoticeText(args.input.title);
  const body = sanitizeNoticeText(args.input.body);
  if (!title || !body) throw new AppError("validation", "notice_text");
  if (args.input.endsOn < args.input.startsOn) throw new AppError("validation", "notice_dates");
  const id = randomUUID();
  await withTenant(args.actor.tenantId, async (tx) => {
    if (!(await contentEnabled(tx))) throw new AppError("forbidden", "entitlement");
    const location = await rows<{ id: string }>(
      tx,
      sql`select id from locations where id = ${args.input.locationId} and status = 'active'`,
    );
    if (!location[0]) throw new AppError("not_found", "location");
    await tx.execute(sql`
      insert into holiday_notices (
        id, tenant_id, location_id, title, body, starts_on, ends_on, status, created_by_principal_id
      ) values (
        ${id}, ${args.actor.tenantId}, ${args.input.locationId}, ${title}, ${body},
        ${args.input.startsOn}::date, ${args.input.endsOn}::date, 'draft', ${args.actor.principalId}
      )
    `);
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: args.input.locationId,
      actorPrincipalId: args.actor.principalId,
      action: "content.notice.create",
      targetType: "holiday_notice",
      targetId: id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { status: "draft" },
    });
  });
  return { id };
}

async function transition(args: {
  actor: ActorContext;
  noticeId: string;
  from: string;
  to: string;
  permission: "content.notice.manage" | "content.notice.publish";
  correlationId: string;
  stamp: "none" | "approved" | "published";
}): Promise<void> {
  await withTenant(args.actor.tenantId, async (tx) => {
    if (!(await contentEnabled(tx))) throw new AppError("forbidden", "entitlement");
    const found = await rows<{ id: string; location_id: string; status: string }>(
      tx,
      sql`select id, location_id, status from holiday_notices where id = ${args.noticeId}`,
    );
    const current = found[0];
    if (!current) throw new AppError("not_found", "notice");
    requirePermission(args.actor, args.permission, current.location_id);
    if (current.status !== args.from) throw new AppError("conflict", "notice_state");
    const updated = await rows<{ id: string }>(
      tx,
      sql`
        update holiday_notices
        set status = ${args.to},
            updated_at = now(),
            approved_at = case when ${args.stamp} = 'approved' then now() else approved_at end,
            published_at = case when ${args.stamp} = 'published' then now() else published_at end
        where id = ${current.id} and status = ${args.from}
        returning id
      `,
    );
    if (!updated[0]) throw new AppError("conflict", "notice_state");
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: current.location_id,
      actorPrincipalId: args.actor.principalId,
      action: `content.notice.${args.to}`,
      targetType: "holiday_notice",
      targetId: current.id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { status: args.to },
    });
  });
}

export function previewNotice(args: { actor: ActorContext; noticeId: string; correlationId: string }) {
  return transition({ ...args, from: "draft", to: "preview", permission: "content.notice.manage", stamp: "none" });
}

export function approveNotice(args: { actor: ActorContext; noticeId: string; correlationId: string }) {
  return transition({ ...args, from: "preview", to: "approved", permission: "content.notice.publish", stamp: "approved" });
}

export function publishNotice(args: { actor: ActorContext; noticeId: string; correlationId: string }) {
  return transition({
    ...args,
    from: "approved",
    to: "published",
    permission: "content.notice.publish",
    stamp: "published",
  });
}

export async function listStaffNotices(actor: ActorContext, locationId: string): Promise<NoticeRow[]> {
  requirePermission(actor, "content.notice.read", locationId);
  return withTenant(actor.tenantId, async (tx) => {
    if (!(await contentEnabled(tx))) return [];
    const found = await rows<{
      id: string;
      title: string;
      body: string;
      starts_on: string;
      ends_on: string;
      status: string;
    }>(
      tx,
      sql`
        select id, title, body, starts_on::text as starts_on, ends_on::text as ends_on, status
        from holiday_notices
        where location_id = ${locationId}
        order by starts_on, title
      `,
    );
    return found.map(mapNotice);
  });
}

export async function listPublicNotices(tenantId: string, locationId: string, today: string): Promise<NoticeRow[]> {
  return withTenant(tenantId, async (tx) => {
    if (!(await contentEnabled(tx))) return [];
    const found = await rows<{
      id: string;
      title: string;
      body: string;
      starts_on: string;
      ends_on: string;
      status: string;
    }>(
      tx,
      sql`
        select id, title, body, starts_on::text as starts_on, ends_on::text as ends_on, status
        from holiday_notices
        where location_id = ${locationId}
          and status = 'published'
          and starts_on <= ${today}::date
          and ends_on >= ${today}::date
        order by starts_on, title
      `,
    );
    return found.map(mapNotice);
  });
}
