import { readPosReport } from "@masulino/pos";
import { errorResponse, json } from "../errors";
import { resolveDefaultScope } from "../session";

export async function handlePosReport(request: Request): Promise<Response> {
  try {
    const resolved = await resolveDefaultScope(request);
    const url = new URL(request.url);
    const locationId = url.searchParams.get("locationId") ?? resolved.locationId;
    const month = url.searchParams.get("month") ?? undefined;
    const view = url.searchParams.get("view") === "year" ? "year" : "month";
    const report = await readPosReport({
      actor: resolved.actor,
      locationId,
      month,
      view,
    });
    return json({ source: "live", report });
  } catch (error) {
    return errorResponse(error);
  }
}
