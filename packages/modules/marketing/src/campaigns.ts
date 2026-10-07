import { randomUUID } from "node:crypto";
import type { CampaignDraftInput } from "@masulino/contracts";
import { AppError } from "@masulino/contracts";
import { authorize, insertAudit, requirePermission, type ActorContext, type OutboxJob } from "@masulino/core";
import { rows, withTenant, type Tx } from "@masulino/database";
import { sql } from "drizzle-orm";
import { requireLocation, requireModule } from "./db";
import type { EligibilityReader } from "./port";

export type CampaignMessageView = {
  id: string;
  contactId: string;
  displayName: string;
  status: "queued" | "previewed" | "failed";
  previewText: string | null;
};

export type CampaignView = {
  id: string;
  status: "draft" | "approved" | "previewed" | "failed";
  body: string;
  startsOn: string;
  version: number;
  draftedByPrincipalId: string;
  messages: CampaignMessageView[];
};

const previewJob = "marketing.campaign.preview";

function canOpen(actor: ActorContext, locationId: string): boolean {
  const actions = [
    "marketing.audience.read",
    "marketing.campaign.draft",
    "marketing.campaign.approve",
    "marketing.campaign.send",
  ] as const;
  return actions.some((action) => authorize({ ...actor, locationId }, action).allow);
}

async function messagesFor(tx: Tx, campaignId: string, version: number): Promise<CampaignMessageView[]> {
  const found = await rows<{
    id: string;
    contact_id: string;
    display_name: string;
    status: CampaignMessageView["status"];
    preview_text: string | null;
  }>(
    tx,
    sql`
      select id, contact_id, display_name, status, preview_text
      from campaign_messages
      where campaign_id = ${campaignId} and campaign_version = ${version}
      order by display_name
    `,
  );
  return found.map((row) => ({
    id: row.id,
    contactId: row.contact_id,
    displayName: row.display_name,
    status: row.status,
    previewText: row.preview_text,
  }));
}

async function refreshCampaignStatus(tx: Tx, campaignId: string, version: number): Promise<void> {
  const found = await rows<{ status: string }>(
    tx,
    sql`
      select status from campaign_messages
      where campaign_id = ${campaignId} and campaign_version = ${version}
    `,
  );
  if (found.some((row) => row.status === "queued")) return;
  const next = found.some((row) => row.status === "failed") ? "failed" : "previewed";
  await tx.execute(sql`
    update campaigns
    set status = ${next}
    where id = ${campaignId} and status = 'approved'
  `);
}

export async function birthdayOutreachEnabled(actor: ActorContext): Promise<boolean> {
  requirePermission(actor, "marketing.campaign.draft");
  return withTenant(actor.tenantId, async (tx) => {
    await requireModule(tx, "marketing");
    const found = await rows<{ birthday_outreach_enabled: boolean }>(
      tx,
      sql`select birthday_outreach_enabled from marketing_settings`,
    );
    return found[0]?.birthday_outreach_enabled === true;
  });
}

export async function listAudience(args: {
  actor: ActorContext;
  locationId: string;
  readEligible: EligibilityReader;
}) {
  requirePermission(args.actor, "marketing.audience.read", args.locationId);
  return withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "marketing");
    await requireLocation(tx, args.locationId);
    return args.readEligible(tx, args.locationId);
  });
}

export async function listCampaigns(args: {
  actor: ActorContext;
  locationId: string;
}): Promise<CampaignView[]> {
  if (!canOpen(args.actor, args.locationId)) {
    throw new AppError("forbidden", "permission");
  }
  return withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "marketing");
    await requireLocation(tx, args.locationId);
    const found = await rows<{
      id: string;
      status: CampaignView["status"];
      body: string;
      starts_on: string;
      version: number;
      drafted_by_principal_id: string;
    }>(
      tx,
      sql`
        select id, status, body, starts_on::text as starts_on, version, drafted_by_principal_id
        from campaigns
        where location_id = ${args.locationId}
        order by created_at
      `,
    );
    const views: CampaignView[] = [];
    for (const row of found) {
      views.push({
        id: row.id,
        status: row.status,
        body: row.body,
        startsOn: row.starts_on.slice(0, 10),
        version: row.version,
        draftedByPrincipalId: row.drafted_by_principal_id,
        messages: await messagesFor(tx, row.id, row.version),
      });
    }
    return views;
  });
}

export async function draftCampaign(args: {
  actor: ActorContext;
  input: CampaignDraftInput;
  correlationId: string;
}): Promise<{ id: string }> {
  requirePermission(args.actor, "marketing.campaign.draft", args.input.locationId);
  const id = randomUUID();
  await withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "marketing");
    await requireLocation(tx, args.input.locationId);
    await tx.execute(sql`
      insert into marketing_settings (tenant_id, birthday_outreach_enabled)
      values (${args.actor.tenantId}, false)
      on conflict (tenant_id) do nothing
    `);
    await tx.execute(sql`
      insert into campaigns (
        id, tenant_id, location_id, version, status, body, starts_on, drafted_by_principal_id
      ) values (
        ${id}, ${args.actor.tenantId}, ${args.input.locationId}, 1, 'draft',
        ${args.input.body}, ${args.input.startsOn}::date, ${args.actor.principalId}
      )
    `);
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: args.input.locationId,
      actorPrincipalId: args.actor.principalId,
      action: "marketing.campaign.draft",
      targetType: "campaign",
      targetId: id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { startsOn: args.input.startsOn },
    });
  });
  return { id };
}

export async function approveCampaign(args: {
  actor: ActorContext;
  campaignId: string;
  correlationId: string;
}): Promise<void> {
  await withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "marketing");
    const found = await rows<{
      id: string;
      location_id: string;
      status: string;
      drafted_by_principal_id: string;
    }>(
      tx,
      sql`
        select id, location_id, status, drafted_by_principal_id
        from campaigns
        where id = ${args.campaignId}
        for update
      `,
    );
    const campaign = found[0];
    if (!campaign) throw new AppError("not_found", "campaign");
    requirePermission(args.actor, "marketing.campaign.approve", campaign.location_id);
    if (campaign.drafted_by_principal_id === args.actor.principalId) {
      throw new AppError("forbidden", "same_actor");
    }
    if (campaign.status !== "draft") throw new AppError("conflict", "campaign_state");
    await tx.execute(sql`
      update campaigns
      set status = 'approved', approved_by_principal_id = ${args.actor.principalId}, approved_at = now()
      where id = ${campaign.id} and status = 'draft'
    `);
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: campaign.location_id,
      actorPrincipalId: args.actor.principalId,
      action: "marketing.campaign.approve",
      targetType: "campaign",
      targetId: campaign.id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { status: "approved" },
    });
  });
}

export async function sendCampaign(args: {
  actor: ActorContext;
  campaignId: string;
  correlationId: string;
  readEligible: EligibilityReader;
}): Promise<{ messageCount: number }> {
  return withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "marketing");
    const found = await rows<{
      id: string;
      location_id: string;
      status: string;
      version: number;
      body: string;
    }>(
      tx,
      sql`
        select id, location_id, status, version, body
        from campaigns
        where id = ${args.campaignId}
        for update
      `,
    );
    const campaign = found[0];
    if (!campaign) throw new AppError("not_found", "campaign");
    requirePermission(args.actor, "marketing.campaign.send", campaign.location_id);
    const already = await rows<{ campaign_id: string }>(
      tx,
      sql`
        select campaign_id from campaign_sends
        where campaign_id = ${campaign.id} and campaign_version = ${campaign.version}
      `,
    );
    if (already[0]) {
      const existing = await messagesFor(tx, campaign.id, campaign.version);
      return { messageCount: existing.length };
    }
    if (campaign.status !== "approved") throw new AppError("conflict", "campaign_state");
    const eligible = await args.readEligible(tx, campaign.location_id);
    await tx.execute(sql`
      insert into campaign_sends (campaign_id, campaign_version, tenant_id)
      values (${campaign.id}, ${campaign.version}, ${args.actor.tenantId})
    `);
    for (const adult of eligible) {
      const messageId = randomUUID();
      const idempotencyKey = `marketing.preview:${campaign.id}:v${campaign.version}:${adult.contactId}`;
      await tx.execute(sql`
        insert into campaign_messages (
          id, tenant_id, location_id, campaign_id, campaign_version, contact_id, display_name,
          status, idempotency_key
        ) values (
          ${messageId}, ${args.actor.tenantId}, ${campaign.location_id}, ${campaign.id},
          ${campaign.version}, ${adult.contactId}, ${adult.displayName}, 'queued', ${idempotencyKey}
        )
      `);
      await tx.execute(sql`
        insert into outbox_jobs (tenant_id, job_type, payload, status, idempotency_key, available_at)
        values (
          ${args.actor.tenantId}, ${previewJob},
          ${JSON.stringify({
            messageId,
            campaignId: campaign.id,
            version: campaign.version,
            contactId: adult.contactId,
            locationId: campaign.location_id,
          })}::jsonb,
          'pending', ${idempotencyKey}, now()
        )
      `);
    }
    if (eligible.length === 0) {
      await tx.execute(sql`
        update campaigns set status = 'previewed' where id = ${campaign.id} and status = 'approved'
      `);
    }
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: campaign.location_id,
      actorPrincipalId: args.actor.principalId,
      action: "marketing.campaign.send",
      targetType: "campaign",
      targetId: campaign.id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { recipients: eligible.length, version: campaign.version },
    });
    return { messageCount: eligible.length };
  });
}

type PreviewPayload = {
  messageId?: string;
  campaignId?: string;
  version?: number;
  contactId?: string;
  locationId?: string;
};

function readPayload(payload: unknown): PreviewPayload {
  if (!payload || typeof payload !== "object") return {};
  return payload as PreviewPayload;
}

export async function handleCampaignPreview(job: OutboxJob, readEligible: EligibilityReader): Promise<void> {
  if (job.job_type !== previewJob) return;
  const payload = readPayload(job.payload);
  if (!payload.messageId || !payload.campaignId || !payload.locationId || !payload.contactId) {
    throw new Error("campaign_preview_failed");
  }
  const enabled = await withTenant(job.tenant_id, async (tx) => {
    const found = await rows<{ enabled: boolean }>(
      tx,
      sql`select enabled from module_entitlements where module_id = 'marketing'`,
    );
    return found[0]?.enabled === true;
  });
  if (!enabled) {
    if (job.attempts >= job.max_attempts) {
      await withTenant(job.tenant_id, async (tx) => {
        await tx.execute(sql`
          update campaign_messages
          set status = 'failed', last_error = 'module_disabled'
          where id = ${payload.messageId} and status = 'queued'
        `);
      });
    }
    throw new Error("module_disabled");
  }
  await withTenant(job.tenant_id, async (tx) => {
    const found = await rows<{
      id: string;
      status: string;
      display_name: string;
      campaign_id: string;
      campaign_version: number;
      body: string;
    }>(
      tx,
      sql`
        select m.id, m.status, m.display_name, m.campaign_id, m.campaign_version, c.body
        from campaign_messages m
        join campaigns c on c.id = m.campaign_id
        where m.id = ${payload.messageId}
      `,
    );
    const message = found[0];
    if (!message || message.status !== "queued") return;
    let eligible: Awaited<ReturnType<EligibilityReader>>;
    try {
      eligible = await readEligible(tx, payload.locationId ?? "");
    } catch {
      await tx.execute(sql`
        update campaign_messages
        set status = 'failed', last_error = 'module_disabled'
        where id = ${message.id} and status = 'queued'
      `);
      await refreshCampaignStatus(tx, message.campaign_id, message.campaign_version);
      return;
    }
    const still = eligible.some((adult) => adult.contactId === payload.contactId);
    if (!still) {
      await tx.execute(sql`
        update campaign_messages
        set status = 'failed', last_error = 'suppressed'
        where id = ${message.id} and status = 'queued'
      `);
      await refreshCampaignStatus(tx, message.campaign_id, message.campaign_version);
      return;
    }
    const text = `Lokale Vorschau für ${message.display_name}: ${message.body}`;
    await tx.execute(sql`
      update campaign_messages
      set status = 'previewed', preview_text = ${text}, last_error = null
      where id = ${message.id} and status = 'queued'
    `);
    await refreshCampaignStatus(tx, message.campaign_id, message.campaign_version);
  });
}
