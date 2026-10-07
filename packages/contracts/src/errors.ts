export class AppError extends Error {
  readonly code:
    | "unauthenticated"
    | "forbidden"
    | "validation"
    | "conflict"
    | "not_found"
    | "incomplete_rules"
    | "idempotency_mismatch"
    | "stale"
    | "last_owner"
    | "rate_limited";

  readonly details?: unknown;

  constructor(
    code: AppError["code"],
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
