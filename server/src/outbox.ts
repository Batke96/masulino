import type { OutboxJob } from "@masulino/core";
import { handleOutboxJob } from "@masulino/reservations";

export async function handleComposedOutbox(job: OutboxJob): Promise<void> {
  await handleOutboxJob(job);
}
