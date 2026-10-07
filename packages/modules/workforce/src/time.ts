import { AppError, roleKeys, type RoleKey } from "@masulino/contracts";
import { insertAudit, requirePermission, type ActorContext } from "@masulino/core";
import { rows, withPublic, withTenant, type Tx } from "@masulino/database";
import { sql } from "drizzle-orm";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readsOtherPeople } from "./access";
import { localParts, parseVenueLocal } from "./clock";
import { locationTimezone, requireModule } from "./db";

export type PunchView = {
  id: string;
  principalId: string;
  displayName: string | null;
  kind: "in" | "out";
  punchedAt: string;
  localDate: string;
  localTime: string;
  source: string;
  corrections: Array<{ id: string; status: string; proposedAt: string; localTime: string }>;
};

function tokenHash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function isPast(value: Date | string | null): boolean {
  if (!value) return false;
  return new Date(value).getTime() <= Date.now();
}

async function insertPunch(
  tx: Tx,
  args: {
    tenantId: string;
    locationId: string;
    principalId: string;
    kind: "in" | "out";
    punchedAt: Date;
    localDate: string;
    source: "phone" | "kiosk";
    correlationId: string;
  },
): Promise<string> {
  const id = randomUUID();
  const effectiveId = randomUUID();
  await tx.execute(sql`
    insert into time_punches (
      id, tenant_id, location_id, principal_id, kind, punched_at, local_date, recorded_by_principal_id, source
    ) values (
      ${id}, ${args.tenantId}, ${args.locationId}, ${args.principalId}, ${args.kind},
      ${args.punchedAt.toISOString()}::timestamptz, ${args.localDate}::date, ${args.principalId}, ${args.source}
    )
  `);
  await tx.execute(sql`
    insert into time_effective_entries (
      id, tenant_id, location_id, principal_id, punch_id, kind, effective_at, local_date, created_by_principal_id
    ) values (
      ${effectiveId}, ${args.tenantId}, ${args.locationId}, ${args.principalId}, ${id}, ${args.kind},
      ${args.punchedAt.toISOString()}::timestamptz, ${args.localDate}::date, ${args.principalId}
    )
  `);
  await insertAudit(tx, {
    tenantId: args.tenantId,
    locationId: args.locationId,
    actorPrincipalId: args.principalId,
    action: "workforce.time.record",
    targetType: "time_punch",
    targetId: id,
    outcome: "success",
    correlationId: args.correlationId,
    changes: { kind: args.kind, source: args.source, localDate: args.localDate },
  });
  return id;
}

export async function recordPhonePunch(args: {
  actor: ActorContext;
  locationId: string;
  kind: "in" | "out";
  punchedAt?: Date;
  correlationId: string;
}): Promise<{ id: string; localDate: string; localTime: string; punchedAt: string }> {
  requirePermission(args.actor, "workforce.time.record", args.locationId);
  const punchedAt = args.punchedAt ?? new Date();
  let localDate = "";
  let localTime = "";
  const id = await withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "workforce");
    const zone = await locationTimezone(tx, args.locationId);
    const parts = localParts(punchedAt, zone);
    localDate = parts.localDate;
    localTime = parts.localTime;
    return insertPunch(tx, {
      tenantId: args.actor.tenantId,
      locationId: args.locationId,
      principalId: args.actor.principalId,
      kind: args.kind,
      punchedAt,
      localDate,
      source: "phone",
      correlationId: args.correlationId,
    });
  });
  return { id, localDate, localTime, punchedAt: punchedAt.toISOString() };
}

export async function requestTimeCorrection(args: {
  actor: ActorContext;
  punchId: string;
  localDate: string;
  localTime: string;
  reason: string;
  correlationId: string;
}): Promise<{ id: string }> {
  const id = randomUUID();
  await withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "workforce");
    const punches = await rows<{
      id: string;
      location_id: string;
      principal_id: string;
      kind: "in" | "out";
      punched_at: Date;
    }>(
      tx,
      sql`select id, location_id, principal_id, kind, punched_at from time_punches where id = ${args.punchId}`,
    );
    const punch = punches[0];
    if (!punch) throw new AppError("not_found", "punch");
    requirePermission(args.actor, "workforce.time.correct", punch.location_id);
    if (punch.principal_id !== args.actor.principalId) throw new AppError("forbidden", "permission");
    const zone = await locationTimezone(tx, punch.location_id);
    const proposed = parseVenueLocal(args.localDate, args.localTime, zone);
    await tx.execute(sql`
      insert into time_correction_requests (
        id, tenant_id, location_id, punch_id, requested_by_principal_id, kind, proposed_punched_at, reason, status
      ) values (
        ${id}, ${args.actor.tenantId}, ${punch.location_id}, ${punch.id}, ${args.actor.principalId},
        ${punch.kind}, ${proposed.toISOString()}::timestamptz, ${args.reason}, 'requested'
      )
    `);
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: punch.location_id,
      actorPrincipalId: args.actor.principalId,
      action: "workforce.time.correct",
      targetType: "time_correction_request",
      targetId: id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { punchId: punch.id, status: "requested" },
    });
  });
  return { id };
}

export async function approveTimeCorrection(args: {
  actor: ActorContext;
  requestId: string;
  correlationId: string;
}): Promise<{ id: string }> {
  const effectiveId = randomUUID();
  await withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "workforce");
    const requests = await rows<{
      id: string;
      location_id: string;
      punch_id: string;
      requested_by_principal_id: string;
      principal_id: string;
      kind: "in" | "out";
      proposed_punched_at: Date;
      status: string;
    }>(
      tx,
      sql`
        select c.id, c.location_id, c.punch_id, c.requested_by_principal_id, p.principal_id, c.kind,
               c.proposed_punched_at, c.status
        from time_correction_requests c
        join time_punches p on p.id = c.punch_id
        where c.id = ${args.requestId}
        for update of c
      `,
    );
    const request = requests[0];
    if (!request) throw new AppError("not_found", "correction");
    requirePermission(args.actor, "workforce.time.approve", request.location_id);
    if (request.requested_by_principal_id === args.actor.principalId) {
      throw new AppError("forbidden", "self_approval");
    }
    if (request.status !== "requested") throw new AppError("conflict", "correction_state");
    const zone = await locationTimezone(tx, request.location_id);
    const proposedAt = new Date(request.proposed_punched_at);
    const parts = localParts(proposedAt, zone);
    const updated = await rows<{ id: string }>(
      tx,
      sql`
        update time_correction_requests
        set status = 'approved'
        where id = ${request.id} and status = 'requested'
        returning id
      `,
    );
    if (!updated[0]) throw new AppError("conflict", "correction_state");
    await tx.execute(sql`
      insert into time_effective_entries (
        id, tenant_id, location_id, principal_id, punch_id, correction_request_id, kind, effective_at,
        local_date, created_by_principal_id
      ) values (
        ${effectiveId}, ${args.actor.tenantId}, ${request.location_id}, ${request.principal_id},
        ${request.punch_id}, ${request.id}, ${request.kind}, ${proposedAt.toISOString()}::timestamptz,
        ${parts.localDate}::date, ${args.actor.principalId}
      )
    `);
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: request.location_id,
      actorPrincipalId: args.actor.principalId,
      action: "workforce.time.approve",
      targetType: "time_correction_request",
      targetId: request.id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { punchId: request.punch_id, status: "approved" },
    });
  });
  return { id: effectiveId };
}

export async function listPunches(actor: ActorContext, locationId: string): Promise<PunchView[]> {
  requirePermission(actor, "workforce.time.read", locationId);
  const others = readsOtherPeople(actor, "workforce.time.read", locationId);
  return withTenant(actor.tenantId, async (tx) => {
    const zone = await locationTimezone(tx, locationId);
    const punches = await rows<{
      id: string;
      principal_id: string;
      display_name: string | null;
      kind: "in" | "out";
      punched_at: Date;
      local_date: string;
      source: string;
    }>(
      tx,
      sql`
        select tp.id, tp.principal_id, p.display_name, tp.kind, tp.punched_at, tp.local_date::text as local_date, tp.source
        from time_punches tp
        left join principals p on p.id = tp.principal_id
        where tp.location_id = ${locationId}
          and (${others}::boolean or tp.principal_id = ${actor.principalId})
        order by tp.punched_at
      `,
    );
    const corrections = await rows<{
      id: string;
      punch_id: string;
      status: string;
      proposed_punched_at: Date;
    }>(
      tx,
      sql`
        select id, punch_id, status, proposed_punched_at
        from time_correction_requests
        where location_id = ${locationId}
      `,
    );
    return punches.map((punch) => {
      const parts = localParts(new Date(punch.punched_at), zone);
      return {
        id: punch.id,
        principalId: punch.principal_id,
        displayName: punch.display_name,
        kind: punch.kind,
        punchedAt: new Date(punch.punched_at).toISOString(),
        localDate: punch.local_date.slice(0, 10),
        localTime: parts.localTime,
        source: punch.source,
        corrections: corrections
          .filter((correction) => correction.punch_id === punch.id)
          .map((correction) => ({
            id: correction.id,
            status: correction.status,
            proposedAt: new Date(correction.proposed_punched_at).toISOString(),
            localTime: localParts(new Date(correction.proposed_punched_at), zone).localTime,
          })),
      };
    });
  });
}

type DeviceRow = {
  id: string;
  tenant_id: string;
  location_id: string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
};

type CapabilityRow = {
  id: string;
  tenant_id: string;
  location_id: string;
  principal_id: string;
  kind: "in" | "out";
  expires_at: Date | string;
  consumed_at: Date | string | null;
};

export async function enrollKioskDevice(args: {
  actor: ActorContext;
  locationId: string;
  correlationId: string;
}): Promise<{ token: string; id: string }> {
  requirePermission(args.actor, "workforce.time.approve", args.locationId);
  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  await withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "workforce");
    await locationTimezone(tx, args.locationId);
    await tx.execute(sql`
      insert into kiosk_devices (id, tenant_id, location_id, token_hash, expires_at, created_by_principal_id)
      values (
        ${id}, ${args.actor.tenantId}, ${args.locationId}, ${tokenHash(token)},
        now() + interval '7 days', ${args.actor.principalId}
      )
    `);
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: args.locationId,
      actorPrincipalId: args.actor.principalId,
      action: "workforce.kiosk.enroll",
      targetType: "kiosk_device",
      targetId: id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { expiresInDays: 7 },
    });
  });
  return { token, id };
}

export async function revokeKioskDevice(args: {
  actor: ActorContext;
  deviceId: string;
  correlationId: string;
}): Promise<void> {
  await withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "workforce");
    const found = await rows<{ id: string; location_id: string }>(
      tx,
      sql`select id, location_id from kiosk_devices where id = ${args.deviceId}`,
    );
    const device = found[0];
    if (!device) throw new AppError("not_found", "kiosk");
    requirePermission(args.actor, "workforce.time.approve", device.location_id);
    await tx.execute(sql`
      update kiosk_devices set revoked_at = now() where id = ${device.id} and revoked_at is null
    `);
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: device.location_id,
      actorPrincipalId: args.actor.principalId,
      action: "workforce.kiosk.revoke",
      targetType: "kiosk_device",
      targetId: device.id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { revoked: true },
    });
  });
}

export async function kioskDeviceReady(rawToken: string): Promise<boolean> {
  const found = await withPublic((tx) =>
    rows<DeviceRow>(tx, sql`select * from app.lookup_kiosk_device(${tokenHash(rawToken)})`),
  );
  const device = found[0];
  if (!device || device.revoked_at || isPast(device.expires_at)) return false;
  return true;
}

export async function issuePunchCapability(args: {
  actor: ActorContext;
  locationId: string;
  kind: "in" | "out";
  correlationId: string;
}): Promise<{ token: string; expiresInMinutes: number }> {
  requirePermission(args.actor, "workforce.time.record", args.locationId);
  const token = randomBytes(32).toString("base64url");
  await withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "workforce");
    await locationTimezone(tx, args.locationId);
    await tx.execute(sql`
      insert into punch_capabilities (
        tenant_id, location_id, principal_id, kind, token_hash, expires_at
      ) values (
        ${args.actor.tenantId}, ${args.locationId}, ${args.actor.principalId}, ${args.kind},
        ${tokenHash(token)}, now() + interval '5 minutes'
      )
    `);
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: args.locationId,
      actorPrincipalId: args.actor.principalId,
      action: "workforce.time.capability",
      targetType: "punch_capability",
      targetId: args.locationId,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { kind: args.kind, expiresInMinutes: 5 },
    });
  });
  return { token, expiresInMinutes: 5 };
}

async function actorForPrincipal(tx: Tx, tenantId: string, principalId: string): Promise<ActorContext | null> {
  const membershipRows = await rows<{ id: string; status: ActorContext["membershipStatus"] }>(
    tx,
    sql`select id, status from memberships where principal_id = ${principalId}`,
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
  return {
    principalId,
    tenantId,
    membershipStatus: membership.status,
    grants: grantRows
      .filter((row) => known.has(row.role_key))
      .map((row) => ({ roleKey: row.role_key as RoleKey, locationId: row.location_id })),
    entitlements: Object.fromEntries(entitlementRows.map((row) => [row.module_id, row.enabled])),
    mfaSatisfied: true,
  };
}

export async function submitKioskPunch(args: {
  deviceToken: string;
  capabilityToken: string;
  correlationId: string;
}): Promise<{ localDate: string; localTime: string }> {
  const devices = await withPublic((tx) =>
    rows<DeviceRow>(tx, sql`select * from app.lookup_kiosk_device(${tokenHash(args.deviceToken)})`),
  );
  const capabilities = await withPublic((tx) =>
    rows<CapabilityRow>(tx, sql`select * from app.lookup_punch_capability(${tokenHash(args.capabilityToken)})`),
  );
  const device = devices[0];
  const capability = capabilities[0];
  if (!device || !capability) throw new AppError("not_found", "kiosk");
  if (device.revoked_at || isPast(device.expires_at)) throw new AppError("not_found", "kiosk");
  if (capability.consumed_at) throw new AppError("conflict", "replay");
  if (isPast(capability.expires_at)) throw new AppError("not_found", "expired");
  if (device.tenant_id !== capability.tenant_id || device.location_id !== capability.location_id) {
    throw new AppError("forbidden", "location");
  }
  let localDate = "";
  let localTime = "";
  await withTenant(device.tenant_id, async (tx) => {
    await requireModule(tx, "workforce");
    const actor = await actorForPrincipal(tx, device.tenant_id, capability.principal_id);
    if (!actor) throw new AppError("forbidden", "membership");
    requirePermission(actor, "workforce.time.record", device.location_id);
    const consumed = await rows<{ id: string }>(
      tx,
      sql`
        update punch_capabilities
        set consumed_at = now()
        where id = ${capability.id} and consumed_at is null and expires_at > now()
        returning id
      `,
    );
    if (!consumed[0]) throw new AppError("conflict", "replay");
    const punchedAt = new Date();
    const zone = await locationTimezone(tx, device.location_id);
    const parts = localParts(punchedAt, zone);
    localDate = parts.localDate;
    localTime = parts.localTime;
    await insertPunch(tx, {
      tenantId: device.tenant_id,
      locationId: device.location_id,
      principalId: capability.principal_id,
      kind: capability.kind,
      punchedAt,
      localDate,
      source: "kiosk",
      correlationId: args.correlationId,
    });
  });
  return { localDate, localTime };
}
