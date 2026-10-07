import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { authSchema } from "./schema/identity";

export type DatabaseRole = "app" | "auth" | "worker" | "migrate";

const pools = new Map<DatabaseRole, Pool>();

function envName(role: DatabaseRole): string {
  switch (role) {
    case "app":
      return "DATABASE_URL";
    case "auth":
      return "DATABASE_URL_AUTH";
    case "worker":
      return "DATABASE_URL_WORKER";
    case "migrate":
      return "DATABASE_URL_MIGRATE";
  }
}

export function databaseUrl(role: DatabaseRole): string {
  const url = process.env[envName(role)];
  if (!url) throw new Error(`Missing ${envName(role)}`);
  return url;
}

export function getPool(role: DatabaseRole): Pool {
  const existing = pools.get(role);
  if (existing) return existing;
  const pool = new Pool({
    connectionString: databaseUrl(role),
    max: process.env.VERCEL ? 1 : 8,
  });
  pools.set(role, pool);
  return pool;
}

export function getAppDb() {
  return drizzle(getPool("app"));
}

export function getAuthDb() {
  return drizzle(getPool("auth"), { schema: authSchema });
}

export function getWorkerDb() {
  return drizzle(getPool("worker"));
}

export async function closePools(): Promise<void> {
  await Promise.all([...pools.values()].map((pool) => pool.end()));
  pools.clear();
}
