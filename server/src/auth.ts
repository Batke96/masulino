import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, twoFactor } from "better-auth/plugins";
import { authSchema, getAuthDb } from "@masulino/database";
import { env, requireMfa } from "./env";

let cached: ReturnType<typeof createAuth> | undefined;

function originFromHost(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("https://") || value.startsWith("http://")) return value;
  return `https://${value}`;
}

function trustedOrigins(baseUrl: string): string[] {
  const origins = new Set<string>([baseUrl, "http://localhost:5173", "http://127.0.0.1:5173"]);
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
    const origin = originFromHost(host);
    if (origin) origins.add(origin);
  }
  return [...origins];
}

function createAuth() {
  const config = env();
  return betterAuth({
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,
    database: drizzleAdapter(getAuthDb(), {
      provider: "pg",
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
    },
    session: {
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 15,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
    rateLimit: {
      window: 60,
      max: 20,
    },
    trustedOrigins: trustedOrigins(config.BETTER_AUTH_URL),
    plugins: [
      organization({
        allowUserToCreateOrganization: false,
      }),
      // Kept so MASULINO_REQUIRE_MFA=1 can ask for a code again. While the
      // flag is off, an enrolled authenticator must not intercept password sign-in.
      ...(requireMfa() ? [twoFactor({ issuer: "Masulino" })] : []),
    ],
  });
}

export function getAuth() {
  cached ??= createAuth();
  return cached;
}
