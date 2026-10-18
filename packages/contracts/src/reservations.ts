import { z } from "zod";
import { roleKeys } from "./permissions";

export const sourceChannels = ["staff_phone", "staff_walk_in", "staff_other", "guest_web"] as const;
export type SourceChannel = (typeof sourceChannels)[number];

export const reservationStatuses = [
  "draft",
  "requested",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type ReservationStatus = (typeof reservationStatuses)[number];

export const adultSeatingModes = ["not_required", "required", "unconfigured"] as const;
export type AdultSeatingMode = (typeof adultSeatingModes)[number];

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const localTime = z.string().regex(/^\d{2}:\d{2}$/);

export const createBookingSchema = z.object({
  locationId: z.uuid(),
  idempotencyKey: z.string().trim().min(8).max(80),
  localDate,
  localTime,
  childrenCount: z.number().int().min(1).max(40),
  adultCount: z.number().int().min(0).max(40),
  packageId: z.uuid(),
  organizerName: z.string().trim().min(1).max(161),
  organizerEmail: z.email(),
  organizerPhone: z.string().trim().min(3).max(40),
  honoreeFirstName: z.string().trim().max(80).optional(),
  honoreeAge: z.number().int().min(1).max(17).optional(),
  organizerGivenName: z.string().trim().min(1).max(80).optional(),
  organizerFamilyName: z.string().trim().min(1).max(80).optional(),
  adultFlatRate: z.boolean().optional(),
  referralSource: z.string().trim().max(80).optional(),
  sourceChannel: z.enum(sourceChannels),
  notes: z.string().trim().max(500).default(""),
  mode: z.enum(["confirm", "request"]).default("confirm"),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const cancelBookingSchema = z.object({
  reservationId: z.uuid(),
  expectedVersion: z.number().int().positive(),
});

export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export const dailyViewSchema = z.object({
  locationId: z.uuid(),
  localDate,
});

export type OpeningInterval = { startMinute: number; endMinute: number } | null;

export type OpeningHours = {
  mon: OpeningInterval;
  tue: OpeningInterval;
  wed: OpeningInterval;
  thu: OpeningInterval;
  fri: OpeningInterval;
  sat: OpeningInterval;
  sun: OpeningInterval;
};

const intervalSchema = z
  .object({
    startMinute: z.number().int().min(0).max(24 * 60),
    endMinute: z.number().int().min(0).max(24 * 60),
  })
  .nullable();

export const openingHoursSchema = z.object({
  mon: intervalSchema,
  tue: intervalSchema,
  wed: intervalSchema,
  thu: intervalSchema,
  fri: intervalSchema,
  sat: intervalSchema,
  sun: intervalSchema,
});

export const publicVenueSlugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]{3,80}$/);

export const guestBookingSchema = createBookingSchema
  .omit({ locationId: true, sourceChannel: true, mode: true })
  .extend({ venueSlug: publicVenueSlugSchema });

export type GuestBookingInput = z.infer<typeof guestBookingSchema>;

export const guestPatchSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    organizerPhone: z.string().trim().min(3).max(40).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.organizerPhone !== undefined || value.notes !== undefined);

export type GuestPatchInput = z.infer<typeof guestPatchSchema>;

export const guestStaffRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  kind: z.enum(["change", "cancel"]),
  message: z.string().trim().max(500).default(""),
});

export type GuestStaffRequestInput = z.infer<typeof guestStaffRequestSchema>;

export const rescheduleBookingSchema = z.object({
  reservationId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  localDate,
  localTime,
  childrenCount: z.number().int().min(1).max(40).optional(),
  adultCount: z.number().int().min(0).max(40).optional(),
});

export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;

export const birthdayPackageCodes = ["comfort", "deluxe"] as const;
export type BirthdayPackageCode = (typeof birthdayPackageCodes)[number];

/** Euro cents. Comfort 14,80 €, Deluxe 21,80 €, adult flat rate 2,50 €. */
export const adultFlatRateMinor = 250;

export const birthdayPackages = [
  {
    code: "comfort" as const,
    name: "Geburtstag Comfort",
    durationMinutes: 120,
    priceMinor: 1480,
    currency: "EUR",
  },
  {
    code: "deluxe" as const,
    name: "Geburtstag Deluxe",
    durationMinutes: 120,
    priceMinor: 2180,
    currency: "EUR",
  },
] as const;

const birthdayPackageSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(z.enum(birthdayPackageCodes));

export const birthdayTimesSchema = z.object({
  date: localDate,
  children: z.coerce.number().int().min(1).max(40).default(8),
  adults: z.coerce.number().int().min(0).max(40).default(4),
  package: birthdayPackageSchema.optional(),
});

export type BirthdayTimesQuery = z.infer<typeof birthdayTimesSchema>;

export const birthdayFormSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(80),
  date: localDate,
  time: localTime,
  package: birthdayPackageSchema,
  childName: z.string().trim().min(1).max(80),
  childAge: z.coerce.number().int().min(1).max(17),
  children: z.coerce.number().int().min(1).max(40),
  adults: z.coerce.number().int().min(0).max(40),
  adultFlatRate: z.boolean().default(false),
  givenName: z.string().trim().min(1).max(80),
  familyName: z.string().trim().min(1).max(80),
  email: z.email(),
  phone: z.string().trim().min(3).max(40),
  message: z.string().trim().max(500).default(""),
  referral: z.string().trim().max(80).default(""),
});

export type BirthdayFormInput = z.infer<typeof birthdayFormSchema>;

export const availabilityQuerySchema = z.object({
  venueSlug: publicVenueSlugSchema,
  localDate,
  childrenCount: z.number().int().min(1).max(40),
  adultCount: z.number().int().min(0).max(40),
  packageId: z.uuid(),
});

export const noticeDraftSchema = z.object({
  locationId: z.uuid(),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(2000),
  startsOn: localDate,
  endsOn: localDate,
});

export type NoticeDraftInput = z.infer<typeof noticeDraftSchema>;

export const noticeActionSchema = z.object({
  noticeId: z.uuid(),
});

export const inviteStaffSchema = z.object({
  email: z.email(),
  roleKey: z.enum(roleKeys),
  locationId: z.uuid().nullable(),
});

export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;
