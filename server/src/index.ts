import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { env } from "./env";
import { errorResponse } from "./errors";
import { handleApiRequest } from "./api-entry";
import { apiSecurityHeaders } from "./security";

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
  for (const [key, value] of Object.entries(apiSecurityHeaders)) {
    if (headers[key] === undefined) headers[key] = value;
  }
  res.writeHead(response.status, headers);
  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

const config = env();
const port = config.MASULINO_API_PORT;

createServer((req, res) => {
  void (async () => {
    try {
      const request = await toWebRequest(req);
      const response = await handleApiRequest(request);
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
