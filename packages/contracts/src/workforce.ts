import { z } from "zod";

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const localTime = z.string().regex(/^\d{2}:\d{2}$/);

export const availabilityWindowSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .refine((value) => value.endMinute > value.startMinute, { message: "window" });

export const saveAvailabilitySchema = z.object({
  locationId: z.uuid(),
  windows: z.array(availabilityWindowSchema).min(1).max(21),
});

export const recordLeaveSchema = z
  .object({
    locationId: z.uuid(),
    startsOn: localDate,
    endsOn: localDate,
    status: z.enum(["requested", "recorded"]),
    reason: z.string().trim().min(1).max(500),
    previousId: z.uuid().optional(),
  })
  .refine((value) => value.endsOn >= value.startsOn, { message: "leave_dates" });

export const proposeWeekSchema = z.object({
  locationId: z.uuid(),
  weekStartsOn: localDate,
});

export const publishPlanSchema = z.object({
  planId: z.uuid(),
});

export const recordPunchSchema = z.object({
  locationId: z.uuid(),
  kind: z.enum(["in", "out"]),
});

export const requestCorrectionSchema = z.object({
  punchId: z.uuid(),
  localDate,
  localTime,
  reason: z.string().trim().min(1).max(500),
});

export const approveCorrectionSchema = z.object({
  requestId: z.uuid(),
});

export const issuePunchCapabilitySchema = z.object({
  locationId: z.uuid(),
  kind: z.enum(["in", "out"]),
});

export type SaveAvailabilityInput = z.infer<typeof saveAvailabilitySchema>;
export type RecordLeaveInput = z.infer<typeof recordLeaveSchema>;
export type ProposeWeekInput = z.infer<typeof proposeWeekSchema>;
export type RecordPunchInput = z.infer<typeof recordPunchSchema>;
export type RequestCorrectionInput = z.infer<typeof requestCorrectionSchema>;
