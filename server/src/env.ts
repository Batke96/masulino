import { z } from "zod";
import { loadRootEnv } from "../../scripts/load-env";

loadRootEnv();

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_AUTH: z.string().min(1),
  DATABASE_URL_WORKER: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  CRON_SECRET: z.string().min(16),
  MASULINO_API_PORT: z.coerce.number().int().positive().default(8787),
  MASULINO_DEV_SESSION: z.enum(["0", "1"]).optional(),
  /**
   * Second factor is off unless this is exactly "1".
   * Unset and "0" keep password sign-in, including a production deploy.
   */
  MASULINO_REQUIRE_MFA: z.enum(["0", "1"]).optional(),
});

export function env() {
  return schema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_AUTH: process.env.DATABASE_URL_AUTH,
    DATABASE_URL_WORKER: process.env.DATABASE_URL_WORKER,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    CRON_SECRET: process.env.CRON_SECRET,
    MASULINO_API_PORT: process.env.MASULINO_API_PORT ?? "8787",
    MASULINO_DEV_SESSION: process.env.MASULINO_DEV_SESSION,
    MASULINO_REQUIRE_MFA: process.env.MASULINO_REQUIRE_MFA,
  });
}

export function allowDevSession(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return env().MASULINO_DEV_SESSION === "1";
}

/** TOTP is required only when someone explicitly sets MASULINO_REQUIRE_MFA=1. */
export function requireMfa(): boolean {
  return env().MASULINO_REQUIRE_MFA === "1";
}
