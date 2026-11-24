import { randomUUID } from "node:crypto";
import { parseWebsiteBooking, websiteRequestDecisionSchema } from "@masulino/contracts";
import { allocate, defaultPreparationTasks } from "@masulino/indoor-play";
import {
  acceptWebsiteRequest,
  listWebsiteRequests,
  rejectWebsiteRequest,
  resolveIntakeLocation,
  reviewWebsiteRequest,
  storeWebsiteRequest,
} from "@masulino/reservations";
import { errorResponse, json } from "../errors";
import { resolveDefaultScope } from "../session";

function berlinToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function declined(): Response {
  return json({ ok: false }, 400);
}

export async function handleWebsiteIntake(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return declined();
  }

  const parsed = parseWebsiteBooking(payload, berlinToday());
  if (!parsed.ok) return declined();
  if (parsed.kind === "honeypot") return json({ ok: true });

  try {
    const location = await resolveIntakeLocation();
    if (!location) return json({ ok: false }, 503);
    await storeWebsiteRequest({
      tenantId: location.tenantId,
      locationId: location.locationId,
      booking: parsed.booking,
    });
    return json({ ok: true });
  } catch {
    return declined();
  }
}

export async function handleListWebsiteRequests(request: Request): Promise<Response> {
  try {
    const scope = new URL(request.url).searchParams.get("scope") === "all" ? "all" : "open";
    const resolved = await resolveDefaultScope(request);
    const requests = await listWebsiteRequests({
      actor: resolved.actor,
      locationId: resolved.locationId,
      scope,
    });
    return json({ source: "live", requests });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleWebsiteDecision(
  request: Request,
  action: "bearbeitet" | "ablehnen" | "annehmen",
): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const parsed = websiteRequestDecisionSchema.safeParse(body);
    if (!parsed.success) return json({ ok: false, reason: "Die Angaben sind unvollständig." }, 400);
    const resolved = await resolveDefaultScope(request);
    const shared = {
      actor: resolved.actor,
      locationId: resolved.locationId,
      requestId: parsed.data.id,
    };
    if (action === "bearbeitet") {
      const result = await reviewWebsiteRequest(shared);
      if (!result.ok) return json({ ok: false, reason: result.reason }, 409);
      return json({ ok: true });
    }
    if (action === "ablehnen") {
      const result = await rejectWebsiteRequest({ ...shared, reason: parsed.data.reason ?? "" });
      if (!result.ok) return json({ ok: false, reason: result.reason }, 409);
      return json({ ok: true });
    }
    const result = await acceptWebsiteRequest({
      ...shared,
      allocate,
      preparationTasks: defaultPreparationTasks(),
      correlationId: randomUUID(),
    });
    if (!result.ok) return json({ ok: false, reason: result.reason }, 409);
    return json({
      ok: true,
      reference: result.reference,
      localDate: result.localDate,
      localTime: result.localTime,
      durationMinutes: result.durationMinutes,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
