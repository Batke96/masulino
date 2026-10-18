import { z } from "zod";

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const publicCodeSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{0,40}$/)
    .nullable(),
);

export const packageRecordSchema = z.object({
  locationId: z.uuid(),
  packageId: z.uuid(),
  publicCode: publicCodeSchema,
  priceMinor: z.number().int().min(0).max(1_000_000),
  durationMinutes: z.number().int().min(15).max(720),
  status: z.enum(["active", "inactive"]),
});

export type PackageRecordInput = z.infer<typeof packageRecordSchema>;

export const resourceRecordSchema = z.object({
  locationId: z.uuid(),
  resourceId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  capacityChildren: z.number().int().min(0).max(80),
  status: z.enum(["active", "inactive"]),
});

export type ResourceRecordInput = z.infer<typeof resourceRecordSchema>;

export const combinationRecordSchema = z
  .object({
    locationId: z.uuid(),
    combinationId: z.uuid(),
    name: z.string().trim().min(1).max(80),
    minChildren: z.number().int().min(0).max(80),
    maxChildren: z.number().int().min(0).max(80),
    maxAdults: z.number().int().min(0).max(80),
    status: z.enum(["active", "inactive"]),
    resourceIds: z.array(z.uuid()).min(1).max(12),
  })
  .refine((value) => value.maxChildren >= value.minChildren, { message: "party_size" });

export type CombinationRecordInput = z.infer<typeof combinationRecordSchema>;

export const closureRecordSchema = z
  .object({
    locationId: z.uuid(),
    startsOn: localDate,
    endsOn: localDate,
    reason: z.string().trim().min(1).max(160),
  })
  .refine((value) => value.endsOn >= value.startsOn, { message: "date_range" });

export type ClosureRecordInput = z.infer<typeof closureRecordSchema>;

export const venueSlugRecordSchema = z.object({
  locationId: z.uuid(),
  publicSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{3,80}$/),
});

export type VenueSlugRecordInput = z.infer<typeof venueSlugRecordSchema>;

export const reservationContactSchema = z.object({
  reservationId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  organizerPhone: z.string().trim().min(3).max(40),
  notes: z.string().trim().max(500),
});

export type ReservationContactInput = z.infer<typeof reservationContactSchema>;

export const membershipActionSchema = z.object({
  membershipId: z.uuid(),
});
