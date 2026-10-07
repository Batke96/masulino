import { randomUUID } from "node:crypto";
import { AppError } from "@masulino/contracts";
import { insertAudit, requirePermission, type ActorContext } from "@masulino/core";
import { rows, withTenant, type Tx } from "@masulino/database";
import { sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { reminderAt } from "./time";

type Kind = "confirmation" | "reminder" | "cancellation";

function jobType(kind: Kind): string {
  if (kind === "confirmation") return "reservation.confirmed";
  if (kind === "reminder") return "reservation.reminder";
  return "reservation.cancelled";
}

async function insertDelivery(
  tx: Tx,
  input: {
    tenantId: string;
    locationId: string;
    reservationId: string;
    kind: Kind;
    version: number;
    scheduledFor: Date;
    idempotencyKey: string;
    availableAt: Date;
    reference: string;
  },
): Promise<void> {
  const deliveryId = randomUUID();
  await tx.execute(sql`
    insert into notification_deliveries (
      id, tenant_id, location_id, reservation_id, kind, status, reservation_version,
      scheduled_for, job_idempotency_key
    ) values (
      ${deliveryId}, ${input.tenantId}, ${input.locationId}, ${input.reservationId}, ${input.kind},
      'queued', ${input.version}, ${input.scheduledFor.toISOString()}::timestamptz, ${input.idempotencyKey}
    )
  `);
  await tx.execute(sql`
    insert into outbox_jobs (tenant_id, job_type, payload, status, idempotency_key, available_at)
    values (
      ${input.tenantId}, ${jobType(input.kind)},
      ${JSON.stringify({
        reservationId: input.reservationId,
        reference: input.reference,
        deliveryId,
        version: input.version,
      })}::jsonb,
      'pending', ${input.idempotencyKey}, ${input.availableAt.toISOString()}::timestamptz
    )
  `);
}

export async function enqueueConfirmationAndReminder(
  tx: Tx,
  input: {
    tenantId: string;
    locationId: string;
    reservationId: string;
    reference: string;
    version: number;
    localDate: string;
    timezone: string;
  },
): Promise<void> {
  const now = new Date();
  await insertDelivery(tx, {
    ...input,
    kind: "confirmation",
    scheduledFor: now,
    availableAt: now,
    idempotencyKey: `reservation.confirmed:${input.reservationId}`,
  });
  const scheduled = reminderAt(input.localDate, input.timezone);
  await insertDelivery(tx, {
    ...input,
    kind: "reminder",
    scheduledFor: scheduled,
    availableAt: scheduled,
    idempotencyKey: `reservation.reminder:${input.reservationId}:v${input.version}`,
  });
}

export async function enqueueCancellation(
  tx: Tx,
  input: {
    tenantId: string;
    locationId: string;
    reservationId: string;
    reference: string;
    version: number;
  },
): Promise<void> {
  const now = new Date();
  await insertDelivery(tx, {
    ...input,
    kind: "cancellation",
    scheduledFor: now,
    availableAt: now,
    idempotencyKey: `reservation.cancelled:${input.reservationId}:v${input.version}`,
  });
}

export async function invalidateQueuedReminders(tx: Tx, reservationId: string): Promise<void> {
  await tx.execute(sql`
    update notification_deliveries
    set status = 'cancelled', updated_at = now()
    where reservation_id = ${reservationId} and kind = 'reminder' and status = 'queued'
  `);
  await tx.execute(sql`
    update outbox_jobs
    set status = 'failed', last_error = 'invalidated', attempts = max_attempts, locked_at = null
    where status = 'pending'
      and job_type = 'reservation.reminder'
      and payload->>'reservationId' = ${reservationId}
  `);
}

export async function replaceReminder(
  tx: Tx,
  input: {
    tenantId: string;
    locationId: string;
    reservationId: string;
    reference: string;
    version: number;
    localDate: string;
    timezone: string;
  },
): Promise<void> {
  await invalidateQueuedReminders(tx, input.reservationId);
  const scheduled = reminderAt(input.localDate, input.timezone);
  await insertDelivery(tx, {
    ...input,
    kind: "reminder",
    scheduledFor: scheduled,
    availableAt: scheduled,
    idempotencyKey: `reservation.reminder:${input.reservationId}:v${input.version}`,
  });
}

type Payload = {
  reservationId?: string;
  reference?: string;
  deliveryId?: string;
  version?: number;
};

function readPayload(payload: unknown): Payload {
  const value = typeof payload === "string" ? (JSON.parse(payload) as unknown) : payload;
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    reservationId: typeof record.reservationId === "string" ? record.reservationId : undefined,
    reference: typeof record.reference === "string" ? record.reference : undefined,
    deliveryId: typeof record.deliveryId === "string" ? record.deliveryId : undefined,
    version: typeof record.version === "number" ? record.version : undefined,
  };
}

function previewText(kind: string, reference: string, localDate: string, localTime: string): string {
  if (kind === "reminder") {
    return `Erinnerung ${reference} am ${localDate} um ${localTime}. Lokale Vorschau, kein Versand.`;
  }
  if (kind === "cancellation") {
    return `Stornierung ${reference}. Lokale Vorschau, kein Versand.`;
  }
  return `Bestätigung ${reference} am ${localDate} um ${localTime}. Lokale Vorschau, kein Versand.`;
}

export async function handleOutboxJob(job: {
  id: string;
  tenant_id: string;
  job_type: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
}): Promise<void> {
  if (
    job.job_type !== "reservation.confirmed" &&
    job.job_type !== "reservation.reminder" &&
    job.job_type !== "reservation.cancelled"
  ) {
    return;
  }
  const payload = readPayload(job.payload);
  if (!payload.deliveryId || !payload.reservationId) throw new Error("delivery_failed");
  const enabled = await withTenant(job.tenant_id, async (tx) => {
    const found = await rows<{ enabled: boolean }>(
      tx,
      sql`select enabled from module_entitlements where module_id = 'reservations'`,
    );
    return found[0]?.enabled === true;
  });
  if (!enabled) {
    if (job.attempts >= job.max_attempts) {
      await withTenant(job.tenant_id, async (tx) => {
        await tx.execute(sql`
          update notification_deliveries
          set status = 'failed', last_error = 'module_disabled', updated_at = now()
          where id = ${payload.deliveryId} and status = 'queued'
        `);
      });
    }
    throw new Error("module_disabled");
  }
  await withTenant(job.tenant_id, async (tx) => {
    const deliveries = await rows<{
      id: string;
      kind: string;
      status: string;
      reservation_version: number;
    }>(
      tx,
      sql`
        select id, kind, status, reservation_version
        from notification_deliveries
        where id = ${payload.deliveryId}
      `,
    );
    const delivery = deliveries[0];
    if (!delivery || delivery.status === "previewed" || delivery.status === "cancelled") return;
    const reservations = await rows<{
      id: string;
      status: string;
      version: number;
      reference: string;
      local_date: string;
      starts_at: Date;
      timezone: string;
    }>(
      tx,
      sql`
        select r.id, r.status, r.version, r.reference, r.local_date::text as local_date, r.starts_at, l.timezone
        from reservations r
        join locations l on l.id = r.location_id
        where r.id = ${payload.reservationId}
      `,
    );
    const reservation = reservations[0];
    const matches =
      reservation !== undefined &&
      reservation.version === delivery.reservation_version &&
      ((delivery.kind === "cancellation" && reservation.status === "cancelled") ||
        (delivery.kind !== "cancellation" && reservation.status === "confirmed"));
    if (!reservation || !matches) {
      await tx.execute(sql`
        update notification_deliveries
        set status = 'cancelled', updated_at = now()
        where id = ${delivery.id} and status = 'queued'
      `);
      return;
    }
    const localTime = DateTime.fromJSDate(new Date(reservation.starts_at)).setZone(reservation.timezone).toFormat("HH:mm");
    const text = previewText(delivery.kind, reservation.reference, reservation.local_date, localTime);
    const updated = await rows<{ id: string }>(
      tx,
      sql`
        update notification_deliveries
        set status = 'previewed', preview_text = ${text}, last_error = null, updated_at = now()
        where id = ${delivery.id} and status = 'queued'
        returning id
      `,
    );
    if (!updated[0]) return;
    await tx.execute(sql`
      insert into notification_previews (tenant_id, job_id, reservation_id, kind, preview_text)
      values (${job.tenant_id}, ${job.id}, ${reservation.id}, ${delivery.kind}, ${text})
      on conflict (job_id) do nothing
    `);
  });
}

export type DeliveryRow = {
  id: string;
  kind: string;
  status: string;
  reference: string;
  reservationId: string;
};

export async function listDeliveries(args: {
  actor: ActorContext;
  locationId: string;
  localDate: string;
}): Promise<DeliveryRow[]> {
  requirePermission(args.actor, "reservations.booking.read", args.locationId);
  return withTenant(args.actor.tenantId, async (tx) => {
    const found = await rows<{
      id: string;
      kind: string;
      status: string;
      reference: string;
      reservation_id: string;
    }>(
      tx,
      sql`
        select d.id, d.kind, d.status, r.reference, d.reservation_id
        from notification_deliveries d
        join reservations r on r.id = d.reservation_id
        where d.location_id = ${args.locationId} and r.local_date = ${args.localDate}::date
        order by r.starts_at, d.kind
      `,
    );
    return found.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      reference: row.reference,
      reservationId: row.reservation_id,
    }));
  });
}

export async function retryDelivery(args: {
  actor: ActorContext;
  deliveryId: string;
  correlationId: string;
}): Promise<void> {
  await withTenant(args.actor.tenantId, async (tx) => {
    const found = await rows<{
      id: string;
      location_id: string;
      reservation_id: string;
      kind: Kind;
      status: string;
      reservation_version: number;
      reference: string;
    }>(
      tx,
      sql`
        select d.id, d.location_id, d.reservation_id, d.kind, d.status, d.reservation_version, r.reference
        from notification_deliveries d
        join reservations r on r.id = d.reservation_id
        where d.id = ${args.deliveryId}
      `,
    );
    const current = found[0];
    if (!current) throw new AppError("not_found", "delivery");
    requirePermission(args.actor, "reservations.booking.update", current.location_id);
    if (current.status !== "failed") throw new AppError("conflict", "delivery_state");
    const updated = await rows<{ id: string }>(
      tx,
      sql`
        update notification_deliveries
        set status = 'queued', last_error = null, updated_at = now()
        where id = ${current.id} and status = 'failed'
        returning id
      `,
    );
    if (!updated[0]) throw new AppError("conflict", "delivery_state");
    const key = `delivery.retry:${current.id}:${randomUUID()}`;
    await tx.execute(sql`
      update notification_deliveries set job_idempotency_key = ${key} where id = ${current.id}
    `);
    await tx.execute(sql`
      insert into outbox_jobs (tenant_id, job_type, payload, status, idempotency_key, available_at)
      values (
        ${args.actor.tenantId}, ${jobType(current.kind)},
        ${JSON.stringify({
          reservationId: current.reservation_id,
          reference: current.reference,
          deliveryId: current.id,
          version: current.reservation_version,
        })}::jsonb,
        'pending', ${key}, now()
      )
    `);
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: current.location_id,
      actorPrincipalId: args.actor.principalId,
      action: "reservations.delivery.retry",
      targetType: "notification_delivery",
      targetId: current.id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { status: "queued" },
    });
  });
}
