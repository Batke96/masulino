import { AppError } from "@masulino/contracts";
import { requirePermission, type ActorContext } from "@masulino/core";
import type { Tx } from "@masulino/database";

type DeliveryInput = {
  tenantId: string;
  locationId: string;
  reservationId: string;
  reference: string;
  version: number;
  localDate?: string;
  timezone?: string;
};

export async function enqueueConfirmationAndReminder(_tx: Tx, _input: DeliveryInput): Promise<void> {}

export async function enqueueCancellation(_tx: Tx, _input: DeliveryInput): Promise<void> {}

export async function invalidateQueuedReminders(_tx: Tx, _reservationId: string): Promise<void> {}

export async function replaceReminder(_tx: Tx, _input: DeliveryInput): Promise<void> {}

export async function handleOutboxJob(_job: {
  id: string;
  tenant_id: string;
  job_type: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
}): Promise<void> {}

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
  return [];
}

export async function retryDelivery(_args: {
  actor: ActorContext;
  deliveryId: string;
  correlationId: string;
}): Promise<void> {
  throw new AppError("not_found", "delivery");
}
