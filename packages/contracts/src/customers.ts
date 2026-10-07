import { z } from "zod";

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const bookedValueQuerySchema = z
  .object({
    locationId: z.uuid(),
    fromDate: localDate,
    toDate: localDate,
  })
  .refine((value) => value.toDate >= value.fromDate, { message: "date_range" });

export const consentEventSchema = z
  .object({
    locationId: z.uuid(),
    contactId: z.uuid().optional(),
    displayName: z.string().trim().min(1).max(200).optional(),
    email: z.email().optional(),
    purpose: z.enum(["marketing", "booking_communication"]),
    channel: z.literal("email"),
    wordingVersion: z.string().trim().min(1).max(80),
    source: z.string().trim().min(1).max(80),
    decision: z.enum(["granted", "withdrawn"]),
  })
  .superRefine((value, context) => {
    if (value.decision === "withdrawn" && !value.contactId) {
      context.addIssue({ code: "custom", message: "contact", path: ["contactId"] });
    }
    if (!value.contactId && (!value.displayName || !value.email)) {
      context.addIssue({ code: "custom", message: "adult", path: ["email"] });
    }
  });

export const campaignDraftSchema = z.object({
  locationId: z.uuid(),
  body: z.string().trim().min(1).max(2000),
  startsOn: localDate,
});

export const surveyAnswersSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

export const redeemRewardSchema = z.object({
  locationId: z.uuid(),
  accountId: z.uuid(),
  units: z.number().int().min(1).max(1000),
});

export type ConsentEventInput = z.infer<typeof consentEventSchema>;
export type CampaignDraftInput = z.infer<typeof campaignDraftSchema>;
export type SurveyAnswersInput = z.infer<typeof surveyAnswersSchema>;
export type RedeemRewardInput = z.infer<typeof redeemRewardSchema>;
