import { randomUUID } from "node:crypto";
import {
  birthdayFormSchema,
  birthdayPackageCodes,
  birthdayTimesSchema,
} from "@masulino/contracts";
import { allocate, defaultPreparationTasks } from "@masulino/indoor-play";
import { birthdayPackage, birthdayTimes, createGuestBooking, readBirthdayReceipt } from "@masulino/reservations";
import { errorResponse, json } from "../errors";
import { bearerMatches, websiteActorId } from "../security";

const WEBSITE_CREATE_LIMIT = 30;

export function websiteSettings(): { key: string; slug: string } | null {
  const key = process.env.MASULINO_SITE_KEY?.trim() ?? "";
  const slug = process.env.MASULINO_PUBLIC_VENUE_SLUG?.trim() ?? "";
  if (key.length < 16 || key.includes("REPLACE_")) return null;
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return null;
  return { key, slug };
}

function param(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name);
  if (value === null || value.trim() === "") return undefined;
  return value;
}

function authorizeWebsite(request: Request): { key: string; slug: string } | Response {
  const settings = websiteSettings();
  if (!settings) return json({ error: "unavailable" }, 503);
  if (!bearerMatches(request.headers.get("authorization"), settings.key)) {
    return json({ error: "unauthorized" }, 401);
  }
  return settings;
}

export async function handleBirthdayTimes(request: Request): Promise<Response> {
  const auth = authorizeWebsite(request);
  if (auth instanceof Response) return auth;
  const url = new URL(request.url);
  const parsed = birthdayTimesSchema.safeParse({
    date: param(url, "date"),
    children: param(url, "children"),
    adults: param(url, "adults"),
    package: param(url, "package"),
  });
  if (!parsed.success) return json({ error: "validation", details: parsed.error.flatten() }, 400);
  try {
    const result = await birthdayTimes({
      slug: auth.slug,
      localDate: parsed.data.date,
      childrenCount: parsed.data.children,
      adultCount: parsed.data.adults,
      packageCodes: parsed.data.package ? [parsed.data.package] : [...birthdayPackageCodes],
      allocate,
    });
    return json({ date: parsed.data.date, closed: result.closed, times: result.times });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleBirthdaySubmit(request: Request): Promise<Response> {
  const auth = authorizeWebsite(request);
  if (auth instanceof Response) return auth;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "validation", details: "json" }, 400);
  }
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const headerKey = request.headers.get("idempotency-key")?.trim();
  const parsed = birthdayFormSchema.safeParse({
    ...record,
    idempotencyKey: headerKey || record.idempotencyKey,
  });
  if (!parsed.success) return json({ error: "validation", details: parsed.error.flatten() }, 400);
  const form = parsed.data;
  try {
    const pkg = await birthdayPackage(auth.slug, form.package);
    const result = await createGuestBooking({
      caller: {
        kind: "guest",
        tenantId: pkg.tenantId,
        locationId: pkg.locationId,
        capabilityId: websiteActorId(auth.key),
      },
      input: {
        locationId: pkg.locationId,
        idempotencyKey: form.idempotencyKey,
        localDate: form.date,
        localTime: form.time,
        childrenCount: form.children,
        adultCount: form.adults,
        packageId: pkg.packageId,
        organizerName: `${form.givenName} ${form.familyName}`,
        organizerEmail: form.email,
        organizerPhone: form.phone,
        honoreeFirstName: form.childName,
        honoreeAge: form.childAge,
        organizerGivenName: form.givenName,
        organizerFamilyName: form.familyName,
        adultFlatRate: form.adultFlatRate,
        referralSource: form.referral,
        sourceChannel: "guest_web",
        notes: form.message,
        mode: "confirm",
      },
      correlationId: randomUUID(),
      allocate,
      preparationTasks: defaultPreparationTasks,
      createLimit: WEBSITE_CREATE_LIMIT,
    });
    if (!result.ok) {
      const times = [...new Set(result.alternatives.map((slot) => slot.localTime))];
      return json({ error: "conflict", times }, 409);
    }
    const receipt = await readBirthdayReceipt(pkg.tenantId, result.booking.id);
    if (!receipt) return json({ error: "not_found" }, 404);
    return json({ ...receipt, payment: "on_site", replayed: result.replayed }, result.replayed ? 200 : 201);
  } catch (error) {
    return errorResponse(error);
  }
}
