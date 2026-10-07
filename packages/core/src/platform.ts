import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  AppError,
  type Action,
  type InviteStaffInput,
  type RoleKey,
  roleKeys,
} from "@masulino/contracts";
import { rows, withIdentity, withTenant, withWorker, type Tx } from "@masulino/database";
import { sql } from "drizzle-orm";
import { authorize, canAssignRole, redactChanges, type AuthzInput, type Grant } from "./authz/policy";

export const IDENTITY_ISSUER = "urn:masulino:better-auth";

export type ActorContext = AuthzInput & {
  principalId: string;
  tenantId: string;
};

export function requirePermission(actor: ActorContext, action: Action, locationId?: string | null): void {
  const decision = authorize({ ...actor, locationId: locationId ?? null }, action);
  if (!decision.allow) {
    throw new AppError("forbidden", decision.reason);
  }
}

export async function insertAudit(
  tx: Tx,
  event: {
    tenantId: string;
    locationId?: string | null;
    actorPrincipalId?: string | null;
    action: string;
    targetType: string;
    targetId: string;
    outcome: string;
    correlationId: string;
    changes?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into audit_events (
      tenant_id, location_id, actor_principal_id, action, target_type, target_id,
      outcome, correlation_id, changes
    ) values (
      ${event.tenantId},
      ${event.locationId ?? null},
      ${event.actorPrincipalId ?? null},
      ${event.action},
      ${event.targetType},
      ${event.targetId},
      ${event.outcome},
      ${event.correlationId},
      ${JSON.stringify(redactChanges(event.changes ?? {}))}::jsonb
    )
  `);
}

export async function ensurePrincipal(user: {
  id: string;
  email: string;
  name: string;
}): Promise<string> {
  return withIdentity({ issuer: IDENTITY_ISSUER, subject: user.id }, async (tx) => {
    const existing = await rows<{ id: string }>(
      tx,
      sql`select id from principals where issuer = ${IDENTITY_ISSUER} and subject = ${user.id}`,
    );
    const found = existing[0];
    if (found) return found.id;
    const id = randomUUID();
    await tx.execute(sql`
      insert into principals (id, issuer, subject, email, display_name)
      values (${id}, ${IDENTITY_ISSUER}, ${user.id}, ${user.email}, ${user.name})
    `);
    return id;
  });
}

export async function listMemberships(principalId: string, subject: string) {
  return withIdentity(
    { issuer: IDENTITY_ISSUER, subject, principalId },
    async (tx) =>
      rows<{
        tenant_id: string;
        tenant_slug: string;
        tenant_name: string;
        status: "active" | "suspended" | "revoked";
      }>(
        tx,
        sql`
          select m.tenant_id, m.status, t.slug as tenant_slug, t.name as tenant_name
          from memberships m
          join tenants t on t.id = m.tenant_id
          where m.principal_id = ${principalId}
          order by t.name
        `,
      ),
  );
}

export async function loadActor(input: {
  principalId: string;
  tenantId: string;
  mfaSatisfied: boolean;
}): Promise<ActorContext | null> {
  return withTenant(input.tenantId, async (tx) => {
    const membershipRows = await rows<{ id: string; status: ActorContext["membershipStatus"] }>(
      tx,
      sql`select id, status from memberships where principal_id = ${input.principalId}`,
    );
    const membership = membershipRows[0];
    if (!membership) return null;
    const grantRows = await rows<{ role_key: string; location_id: string | null }>(
      tx,
      sql`select role_key, location_id from grants where membership_id = ${membership.id}`,
    );
    const entitlementRows = await rows<{ module_id: string; enabled: boolean }>(
      tx,
      sql`select module_id, enabled from module_entitlements`,
    );
    const known = new Set<string>(roleKeys);
    const grants: Grant[] = grantRows
      .filter((row) => known.has(row.role_key))
      .map((row) => ({ roleKey: row.role_key as RoleKey, locationId: row.location_id }));
    return {
      principalId: input.principalId,
      tenantId: input.tenantId,
      membershipStatus: membership.status,
      grants,
      entitlements: Object.fromEntries(entitlementRows.map((row) => [row.module_id, row.enabled])),
      mfaSatisfied: input.mfaSatisfied,
    };
  });
}

function locationRequired(role: RoleKey): boolean {
  return role !== "tenant_owner" && role !== "tenant_administrator";
}

export async function inviteStaff(
  actor: ActorContext,
  input: InviteStaffInput,
  correlationId: string,
): Promise<{ invitationId: string; acceptPath: string }> {
  requirePermission(actor, "core.users.invite");
  if (!canAssignRole(actor, input.roleKey, input.locationId)) {
    throw new AppError("forbidden", "grant_outside_authority");
  }
  if (locationRequired(input.roleKey) && !input.locationId) {
    throw new AppError("validation", "location_required");
  }
  if (!locationRequired(input.roleKey) && input.locationId) {
    throw new AppError("validation", "location_not_allowed");
  }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const id = randomUUID();
  await withTenant(actor.tenantId, async (tx) => {
    if (input.locationId) {
      const location = await rows<{ id: string }>(
        tx,
        sql`select id from locations where id = ${input.locationId}`,
      );
      if (!location[0]) throw new AppError("not_found", "location");
    }
    await tx.execute(sql`
      insert into staff_invitations (
        id, tenant_id, email, role_key, location_id, token_hash, expires_at, invited_by_principal_id
      ) values (
        ${id}, ${actor.tenantId}, ${input.email.toLowerCase()}, ${input.roleKey}, ${input.locationId},
        ${tokenHash}, now() + interval '7 days', ${actor.principalId}
      )
    `);
    await insertAudit(tx, {
      tenantId: actor.tenantId,
      locationId: input.locationId,
      actorPrincipalId: actor.principalId,
      action: "core.users.invite",
      targetType: "staff_invitation",
      targetId: id,
      outcome: "success",
      correlationId,
      changes: { roleKey: input.roleKey, email: input.email },
    });
  });
  return { invitationId: id, acceptPath: `/invitations/accept?token=${encodeURIComponent(token)}` };
}

export async function acceptInvitation(input: {
  token: string;
  principalId: string;
  subject: string;
  email: string;
  correlationId: string;
}): Promise<{ tenantId: string }> {
  const tokenHash = createHash("sha256").update(input.token).digest("hex");
  const found = await withIdentity(
    { issuer: IDENTITY_ISSUER, subject: input.subject, principalId: input.principalId },
    async (tx) =>
      rows<{
        id: string;
        tenant_id: string;
        email: string;
        role_key: RoleKey;
        location_id: string | null;
      }>(tx, sql`select * from app.lookup_invitation(${tokenHash})`),
  );
  const invitation = found[0];
  if (!invitation) throw new AppError("not_found", "invitation");
  if (invitation.email.toLowerCase() !== input.email.toLowerCase()) {
    throw new AppError("forbidden", "invitation_email");
  }
  await withTenant(invitation.tenant_id, async (tx) => {
    const existing = await rows<{ id: string; status: string }>(
      tx,
      sql`select id, status from memberships where principal_id = ${input.principalId}`,
    );
    let membershipId = existing[0]?.id;
    if (!membershipId) {
      membershipId = randomUUID();
      await tx.execute(sql`
        insert into memberships (id, tenant_id, principal_id, status)
        values (${membershipId}, ${invitation.tenant_id}, ${input.principalId}, 'active')
      `);
    } else if (existing[0]?.status !== "active") {
      throw new AppError("forbidden", "membership");
    }
    await tx.execute(sql`
      insert into grants (tenant_id, membership_id, role_key, location_id)
      values (${invitation.tenant_id}, ${membershipId}, ${invitation.role_key}, ${invitation.location_id})
      on conflict do nothing
    `);
    const updated = await rows<{ id: string }>(
      tx,
      sql`
        update staff_invitations
        set accepted_at = now()
        where id = ${invitation.id} and accepted_at is null and revoked_at is null
        returning id
      `,
    );
    if (!updated[0]) throw new AppError("conflict", "invitation_used");
    await insertAudit(tx, {
      tenantId: invitation.tenant_id,
      locationId: invitation.location_id,
      actorPrincipalId: input.principalId,
      action: "core.users.accept_invitation",
      targetType: "staff_invitation",
      targetId: invitation.id,
      outcome: "success",
      correlationId: input.correlationId,
      changes: { roleKey: invitation.role_key },
    });
  });
  return { tenantId: invitation.tenant_id };
}

export function tokensMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type OutboxJob = {
  id: string;
  tenant_id: string;
  job_type: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
};

export async function drainOutbox(
  workerId: string,
  handle: (job: OutboxJob) => Promise<void>,
): Promise<{
  claimed: number;
  succeeded: number;
  failed: number;
}> {
  const jobs = await withWorker(async (tx) =>
    rows<OutboxJob>(
      tx,
      sql`
        with picked as (
          select id from outbox_jobs
          where status = 'pending' and available_at <= now() and attempts < max_attempts
          order by available_at
          for update skip locked
          limit 10
        )
        update outbox_jobs as job
        set status = 'claimed', locked_at = now(), locked_by = ${workerId}, attempts = job.attempts + 1
        from picked
        where job.id = picked.id
        returning job.id, job.tenant_id, job.job_type, job.payload, job.attempts, job.max_attempts
      `,
    ),
  );

  let succeeded = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await handle(job);
      await withWorker(async (tx) => {
        await tx.execute(sql`
          update outbox_jobs
          set status = 'succeeded', locked_at = null, last_error = null
          where id = ${job.id} and status = 'claimed'
        `);
      });
      succeeded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "failed";
      await withWorker(async (tx) => {
        await tx.execute(sql`
          update outbox_jobs
          set status = case when attempts >= max_attempts then 'failed' else 'pending' end,
              available_at = now() + (interval '15 seconds' * attempts),
              last_error = ${message},
              locked_at = null
          where id = ${job.id} and status = 'claimed'
        `);
      });
      failed += 1;
    }
  }
  return { claimed: jobs.length, succeeded, failed };
}

export async function countActiveOwners(tx: Tx): Promise<number> {
  const result = await rows<{ count: number }>(
    tx,
    sql`
      select count(distinct m.id)::int as count
      from memberships m
      join grants g on g.membership_id = m.id
      where m.status = 'active' and g.role_key = 'tenant_owner'
    `,
  );
  return result[0]?.count ?? 0;
}

export async function revokeMembership(input: {
  actor: ActorContext;
  membershipId: string;
  correlationId: string;
}): Promise<void> {
  requirePermission(input.actor, "core.roles.manage");
  await withTenant(input.actor.tenantId, async (tx) => {
    const target = await rows<{ id: string; status: string }>(
      tx,
      sql`select id, status from memberships where id = ${input.membershipId}`,
    );
    const membership = target[0];
    if (!membership) throw new AppError("not_found", "membership");
    const ownerGrant = await rows<{ id: string }>(
      tx,
      sql`
        select id from grants
        where membership_id = ${membership.id} and role_key = 'tenant_owner'
      `,
    );
    if (ownerGrant[0] && (await countActiveOwners(tx)) <= 1) {
      throw new AppError("last_owner", "last_owner");
    }
    await tx.execute(sql`
      update memberships set status = 'revoked', updated_at = now() where id = ${membership.id}
    `);
    await insertAudit(tx, {
      tenantId: input.actor.tenantId,
      actorPrincipalId: input.actor.principalId,
      action: "core.membership.revoke",
      targetType: "membership",
      targetId: membership.id,
      outcome: "success",
      correlationId: input.correlationId,
      changes: { status: "revoked" },
    });
  });
}
