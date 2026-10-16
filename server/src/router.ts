import { drainOutbox } from "@masulino/core";
import { getAuth } from "./auth";
import { env } from "./env";
import { handleStaffSession } from "./session";
import { json } from "./errors";
import {
  handleApproveCampaign,
  handleCancelBooking,
  handleCreateBooking,
  handleDraftCampaign,
  handlePackages,
  handleRedeemReward,
  handleSection,
  handleSendCampaign,
  handleWorkspaceBootstrap,
} from "./handlers/sections";
import { handleComposedOutbox } from "./outbox";
import { handleBirthdaySubmit, handleBirthdayTimes } from "./handlers/birthdays";
import { bearerMatches } from "./security";

export async function route(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname.startsWith("/api/auth")) {
    return getAuth().handler(request);
  }

  if (pathname === "/api/health" && request.method === "GET") {
    return json({ ok: true, service: "masulino-api" });
  }

  if (pathname === "/api/cron/outbox" && (request.method === "GET" || request.method === "POST")) {
    const config = env();
    if (!bearerMatches(request.headers.get("authorization"), config.CRON_SECRET)) {
      return json({ error: "unauthorized" }, 401);
    }
    const result = await drainOutbox("node-cron", handleComposedOutbox);
    return json(result);
  }

  if (pathname === "/api/session" && request.method === "GET") {
    return handleStaffSession(request);
  }

  if (pathname === "/api/workspace" && request.method === "GET") {
    return handleWorkspaceBootstrap(request);
  }

  if (pathname.startsWith("/api/sections/") && request.method === "GET") {
    const section = pathname.slice("/api/sections/".length);
    return handleSection(request, section);
  }

  if (pathname === "/api/packages" && request.method === "GET") {
    return handlePackages(request);
  }

  if (pathname === "/api/public/birthdays/times" && request.method === "GET") {
    return handleBirthdayTimes(request);
  }

  if (pathname === "/api/public/birthdays" && request.method === "POST") {
    return handleBirthdaySubmit(request);
  }

  if (pathname === "/api/bookings" && request.method === "POST") {
    return handleCreateBooking(request);
  }

  if (pathname === "/api/bookings/cancel" && request.method === "POST") {
    return handleCancelBooking(request);
  }

  if (pathname === "/api/campaigns/draft" && request.method === "POST") {
    return handleDraftCampaign(request);
  }

  if (pathname === "/api/campaigns/approve" && request.method === "POST") {
    return handleApproveCampaign(request);
  }

  if (pathname === "/api/campaigns/send" && request.method === "POST") {
    return handleSendCampaign(request);
  }

  if (pathname === "/api/loyalty/redeem" && request.method === "POST") {
    return handleRedeemReward(request);
  }

  return json({ error: "not_found" }, 404);
}
