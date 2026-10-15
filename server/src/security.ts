import { createHash, timingSafeEqual } from "node:crypto";

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
