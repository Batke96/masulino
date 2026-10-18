import { drainOutbox } from "@masulino/core";
import { getAuth } from "./auth";
import { clearSyntheticAuthenticators } from "./mfa";
import { env } from "./env";
import { handleStaffSession } from "./session";
import { json } from "./errors";
import { handleCreateStaff, handleListStaff, handleRemoveStaff } from "./handlers/staff-accounts";
import {
  handleInviteStaff,
  handleItClosure,
  handleItCombination,
  handleItDirectory,
  handleItPackage,
  handleItRecords,
  handleItReport,
  handleItResource,
  handleItVenue,
  handleRescheduleBooking,
  handleReservationContact,
  handleRestoreMembership,
  handleSuspendMembership,
} from "./handlers/it";
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

  if (pathname.startsWith("/api/auth") || pathname === "/api/session") {
    await clearSyntheticAuthenticators();
  }

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

  if (pathname === "/api/staff/users" && request.method === "GET") {
    return handleListStaff(request);
  }

  if (pathname === "/api/staff/users" && request.method === "POST") {
    return handleCreateStaff(request);
  }

  if (pathname === "/api/staff/users/remove" && request.method === "POST") {
    return handleRemoveStaff(request);
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

  if (pathname === "/api/bookings/reschedule" && request.method === "POST") {
    return handleRescheduleBooking(request);
  }

  if (pathname === "/api/bookings/contact" && request.method === "POST") {
    return handleReservationContact(request);
  }

  if (pathname === "/api/invitations" && request.method === "POST") {
    return handleInviteStaff(request);
  }

  if (pathname === "/api/it/directory" && request.method === "GET") {
    return handleItDirectory(request);
  }

  if (pathname === "/api/it/memberships/suspend" && request.method === "POST") {
    return handleSuspendMembership(request);
  }

  if (pathname === "/api/it/memberships/restore" && request.method === "POST") {
    return handleRestoreMembership(request);
  }

  if (pathname === "/api/it/report" && request.method === "GET") {
    return handleItReport(request);
  }

  if (pathname === "/api/it/records" && request.method === "GET") {
    return handleItRecords(request);
  }

  if (pathname === "/api/it/packages" && request.method === "POST") {
    return handleItPackage(request);
  }

  if (pathname === "/api/it/resources" && request.method === "POST") {
    return handleItResource(request);
  }

  if (pathname === "/api/it/combinations" && request.method === "POST") {
    return handleItCombination(request);
  }

  if (pathname === "/api/it/closures" && request.method === "POST") {
    return handleItClosure(request);
  }

  if (pathname === "/api/it/venue" && request.method === "POST") {
    return handleItVenue(request);
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
