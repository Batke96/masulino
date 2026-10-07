import { AppError, type AdultSeatingMode, type OpeningHours } from "@masulino/contracts";

export type PublishedRule = {
  timezone: string;
  openingHours: OpeningHours;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  slotMinutes: number;
  combinationCount: number;
  adultSeating: AdultSeatingMode;
  cancellationPolicy: string | null;
  businessDecisionsConfirmed: boolean;
  fixture: boolean;
};

export function assertCanUsePublishedRule(rule: PublishedRule, env: string): void {
  const missing: string[] = [];
  if (!rule.timezone) missing.push("timezone");
  if (!rule.openingHours) missing.push("openingHours");
  if (rule.bufferBeforeMinutes < 0 || rule.bufferAfterMinutes < 0) missing.push("buffers");
  if (rule.slotMinutes <= 0) missing.push("slotMinutes");
  if (rule.combinationCount < 1) missing.push("combinations");
  if (rule.adultSeating === "unconfigured") missing.push("adultSeating");
  if (env === "production") {
    if (!rule.businessDecisionsConfirmed) missing.push("businessDecisionsConfirmed");
    if (!rule.cancellationPolicy) missing.push("cancellationPolicy");
    if (rule.fixture) missing.push("fixture");
  }
  if (missing.length > 0) {
    throw new AppError("incomplete_rules", "incomplete_rule_set", { missing });
  }
}
