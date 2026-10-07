import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { authSchema, getAuthDb } from "@masulino/database";
import { env } from "./env";

let cached: ReturnType<typeof createAuth> | undefined;

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
    trustedOrigins: [config.BETTER_AUTH_URL, "http://localhost:5173", "http://127.0.0.1:5173"],
    plugins: [
      organization({
        allowUserToCreateOrganization: false,
      }),
    ],
  });
}

export function getAuth() {
  cached ??= createAuth();
  return cached;
}
