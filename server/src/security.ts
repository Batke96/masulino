import { createHash, timingSafeEqual } from "node:crypto";

/** Stable guest id for the website key, so a repeated submit finds the same booking. */
export function websiteActorId(secret: string): string {
  const bytes = createHash("sha256").update(`masulino-website:${secret}`).digest();
  const id = Buffer.from(bytes.subarray(0, 16));
  id[6] = (id[6]! & 0x0f) | 0x40;
  id[8] = (id[8]! & 0x3f) | 0x80;
  const hex = id.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Compare a bearer token without leaking the secret through an early length check. */
export function bearerMatches(header: string | null, secret: string): boolean {
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const left = createHash("sha256").update(token).digest();
  const right = createHash("sha256").update(secret).digest();
  return timingSafeEqual(left, right);
}

export const apiSecurityHeaders: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "cache-control": "no-store",
};

export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  const cookies = response.headers.getSetCookie?.() ?? [];
  if (cookies.length > 0) {
    headers.delete("set-cookie");
    for (const cookie of cookies) headers.append("set-cookie", cookie);
  }
  for (const [key, value] of Object.entries(apiSecurityHeaders)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
