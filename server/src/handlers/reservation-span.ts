import { readReservationSpan } from "@masulino/reservations";
import { ensureHostedDemoParties } from "../demo-parties";
import { errorResponse, json } from "../errors";
import { resolveDefaultScope } from "../session";

export async function handleReservationSpan(request: Request): Promise<Response> {
  try {
    const resolved = await resolveDefaultScope(request);
    await ensureHostedDemoParties({
      tenantId: resolved.tenantId,
      tenantSlug: resolved.tenantSlug,
      locationId: resolved.locationId,
      locationSlug: resolved.locationSlug,
      timezone: resolved.timezone,
      principalId: resolved.actor.principalId,
    });
    const url = new URL(request.url);
    const fromDate = url.searchParams.get("from") ?? "";
    const toDate = url.searchParams.get("to") ?? "";
    const reservations = await readReservationSpan({
      actor: resolved.actor,
      locationId: resolved.locationId,
      fromDate,
      toDate,
    });
    return json({ source: "live", reservations });
  } catch (error) {
    return errorResponse(error);
  }
}
