import { isAppError } from "@masulino/contracts";

export type ApiErrorBody = {
  error: string;
  details?: unknown;
  alternatives?: string[];
  missing?: string[];
};

export function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export function errorResponse(error: unknown): Response {
  if (isAppError(error)) {
    const body: ApiErrorBody = {
      error: error.code,
      details: error.details ?? error.message,
    };
    if (error.code === "conflict" && error.details && typeof error.details === "object") {
      const details = error.details as { alternatives?: Array<{ localTime: string; combinationName: string }> };
      if (details.alternatives) {
        body.alternatives = details.alternatives.map(
          (slot) => `${slot.localTime} · ${slot.combinationName}`,
        );
      }
    }
    if (error.code === "incomplete_rules" && error.details && typeof error.details === "object") {
      const details = error.details as { missing?: string[] };
      if (details.missing) body.missing = details.missing;
    }
    const status =
      error.code === "unauthenticated"
        ? 401
        : error.code === "forbidden"
          ? 403
          : error.code === "not_found"
            ? 404
            : error.code === "rate_limited"
              ? 429
              : error.code === "validation" || error.code === "idempotency_mismatch"
                ? 400
                : error.code === "conflict" || error.code === "stale" || error.code === "last_owner"
                  ? 409
                  : 400;
    return json(body, status);
  }
  console.error(error);
  return json({ error: "generic" }, 500);
}
