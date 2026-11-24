import { z } from "zod";
import { birthdaySlotLabels, birthdayTimeWindows, kitaTimeWindow } from "./schedule";

export { birthdayTimeWindows, kitaTimeWindow };

export const birthdaySources = [
  "",
  "Google / Google Maps",
  "Facebook",
  "Instagram",
  "Freunde & Bekannte",
  "Schule / Kita",
  "Wir waren schon einmal bei Masulino",
  "Flyer",
  "Plakat",
  "Vorbeigefahren / vor Ort gesehen",
  "Sonstiges",
] as const;

export const kitaSources = [
  "",
  "Google / Google Maps",
  "Facebook",
  "Instagram",
  "Empfehlung",
  "Schon einmal bei Masulino gewesen",
  "Flyer / Plakat",
  "Vorbeigefahren / vor Ort gesehen",
  "Sonstiges",
] as const;

export const kitaKinds = ["Kita", "Schule", "Andere Einrichtung"] as const;

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const phone = z.string().regex(/^[0-9 +()/-]{3,40}$/);
const previewCents = z.number().int().nonnegative().max(2_147_483_647);
const message = z.string().max(2000);
const personName = z.string().min(1).max(120);
const reservationEmail = z.email();
const salutation = z.enum(["Frau", "Herr", "keine Angabe"]);
const street = z.string().trim().min(1).max(120);
const postalCode = z.string().regex(/^[0-9]{5}$/);

const shared = {
  anrede: salutation,
  adresse: street,
  plz: postalCode,
  email: z.string().min(1).max(254),
  telefon: phone,
  nachricht: message,
  datenschutz: z.literal("on"),
  website: z.literal(""),
};

export const websiteBirthdaySchema = z
  .strictObject({
    buchung: z.literal("geburtstag"),
    datum: calendarDate,
    zeitfenster: z.enum(birthdayTimeWindows),
    paket: z.enum(["comfort", "deluxe"]),
    kind_name: personName,
    kind_alter: z.string().regex(/^(?:[1-9]|1[0-8])$/),
    kinder: z.number().int().min(1).max(60),
    kleinkinder: z.number().int().min(0).max(60),
    erwachsene: z.number().int().min(0).max(60),
    erwachsenenZusatz: z.boolean(),
    summeVorschau: previewCents,
    vorname: personName,
    nachname: personName,
    quelle: z.enum(birthdaySources),
    ...shared,
  })
  .superRefine((value, ctx) => {
    if (value.erwachsenenZusatz && (value.paket !== "deluxe" || value.erwachsene < 1)) {
      ctx.addIssue({ code: "custom", message: "erwachsenenZusatz", path: ["erwachsenenZusatz"] });
    }
  });

export const websiteKitaSchema = z.strictObject({
  buchung: z.literal("kita"),
  wunschtermin: calendarDate,
  zeitfenster: z.literal(kitaTimeWindow),
  kinder: z.number().int().min(1).max(500),
  paedagogen: z.number().int().min(0).max(500),
  begleitpersonen: z.number().int().min(0).max(500),
  summeVorschau: previewCents,
  einrichtung: z.string().min(1).max(160),
  art: z.enum(kitaKinds),
  ansprechpartner: personName,
  quelle: z.enum(kitaSources),
  ...shared,
});

export type WebsiteBirthday = z.infer<typeof websiteBirthdaySchema>;
export type WebsiteKita = z.infer<typeof websiteKitaSchema>;
export type WebsiteBooking = WebsiteBirthday | WebsiteKita;

export const websiteRequestDecisionSchema = z.strictObject({
  id: z.uuid(),
  reason: z.string().max(500).optional(),
});

export type WebsiteRequestDecision = z.infer<typeof websiteRequestDecisionSchema>;

export function isReservationEmail(value: string): boolean {
  return reservationEmail.safeParse(value).success;
}

export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isMondayToFriday(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

/** A filled honeypot is not an error. The caller still receives success and nothing is stored. */
export function websiteHoneypotTripped(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const website = (payload as { website?: unknown }).website;
  return typeof website === "string" && website.length > 0;
}

export function readStoredWebsiteBooking(payload: unknown): WebsiteBooking | null {
  const birthday = websiteBirthdaySchema.safeParse(payload);
  if (birthday.success) return birthday.data;
  const kita = websiteKitaSchema.safeParse(payload);
  if (kita.success) return kita.data;
  return null;
}

export function parseWebsiteBooking(
  payload: unknown,
  today: string,
): { ok: true; kind: "honeypot" } | { ok: true; kind: "booking"; booking: WebsiteBooking } | { ok: false } {
  if (websiteHoneypotTripped(payload)) return { ok: true, kind: "honeypot" };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { ok: false };
  const buchung = (payload as { buchung?: unknown }).buchung;
  if (buchung === "geburtstag") {
    const parsed = websiteBirthdaySchema.safeParse(payload);
    if (!parsed.success) return { ok: false };
    if (!isCalendarDate(parsed.data.datum) || parsed.data.datum < today) return { ok: false };
    if (!birthdaySlotLabels(parsed.data.datum).includes(parsed.data.zeitfenster)) return { ok: false };
    return { ok: true, kind: "booking", booking: parsed.data };
  }
  if (buchung === "kita") {
    const parsed = websiteKitaSchema.safeParse(payload);
    if (!parsed.success) return { ok: false };
    if (!isCalendarDate(parsed.data.wunschtermin) || parsed.data.wunschtermin < today) return { ok: false };
    if (!isMondayToFriday(parsed.data.wunschtermin)) return { ok: false };
    return { ok: true, kind: "booking", booking: parsed.data };
  }
  return { ok: false };
}

export function windowStart(zeitfenster: string): string {
  return zeitfenster.slice(0, 5);
}
