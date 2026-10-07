import { eligibleAdults } from "@masulino/contacts";
import type { OutboxJob } from "@masulino/core";
import { handleCampaignPreview } from "@masulino/marketing";
import { handleOutboxJob } from "@masulino/reservations";

export async function handleComposedOutbox(job: OutboxJob): Promise<void> {
  if (job.job_type === "marketing.campaign.preview") {
    await handleCampaignPreview(job, eligibleAdults);
    return;
  }
  await handleOutboxJob(job);
}
