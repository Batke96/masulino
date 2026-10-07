import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { drainOutbox } from "@masulino/core";
import { getAuth } from "./auth";
import { env } from "./env";
import { handleStaffSession } from "./session";
import { errorResponse, json } from "./errors";
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

function collectBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? "127.0.0.1";
  const url = new URL(req.url ?? "/", `http://${host}`);
  const method = req.method ?? "GET";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers });
  }
  const body = await collectBody(req);
  return new Request(url, { method, headers, body: new Uint8Array(body) });
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    const existing = headers[key];
    if (existing === undefined) headers[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else headers[key] = [existing, value];
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) headers["set-cookie"] = cookies;
  res.writeHead(response.status, headers);
  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

async function route(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname.startsWith("/api/auth")) {
    return getAuth().handler(request);
  }

  if (pathname === "/api/health" && request.method === "GET") {
    return json({ ok: true, service: "masulino-api" });
  }

  if (
    (pathname === "/api/cron/outbox" && (request.method === "GET" || request.method === "POST"))
  ) {
    const config = env();
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${config.CRON_SECRET}`) {
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

const config = env();
const port = config.MASULINO_API_PORT;

createServer((req, res) => {
  void (async () => {
    try {
      const request = await toWebRequest(req);
      const response = await route(request);
      await writeResponse(res, response);
    } catch (error) {
      await writeResponse(res, errorResponse(error));
    }
  })();
}).listen(port, "127.0.0.1", () => {
  console.log(`Masulino API listening on http://127.0.0.1:${port}`);
  if (process.env.MASULINO_DEV_SESSION === "1" && process.env.NODE_ENV !== "production") {
    console.log("MASULINO_DEV_SESSION=1: seeded owner actor is used when no session cookie is present");
  }
});
