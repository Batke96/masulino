import { sql, type SQL } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { getAppDb, getWorkerDb } from "./client";

export type Tx = PgTransaction<
  NodePgQueryResultHKT,
  Record<string, never>,
  ExtractTablesWithRelations<Record<string, never>>
>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, label: string): void {
  if (!UUID.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
}

export async function rows<T extends Record<string, unknown>>(
  tx: Tx,
  query: SQL,
): Promise<T[]> {
  const result: unknown = await tx.execute(query);
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

async function applySettings(tx: Tx, settings: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(settings)) {
    await tx.execute(sql`select set_config(${key}, ${value}, true)`);
  }
}

const cleared = {
  "app.context": "",
  "app.tenant_id": "",
  "app.principal_id": "",
  "app.subject": "",
  "app.issuer": "",
  "app.worker_purpose": "",
};

export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  assertUuid(tenantId, "tenant id");
  return getAppDb().transaction(async (tx) => {
    await applySettings(tx, {
      ...cleared,
      "app.context": "tenant",
      "app.tenant_id": tenantId,
    });
    return fn(tx);
  });
}

export async function withIdentity<T>(
  input: { issuer: string; subject: string; principalId?: string },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (input.principalId) assertUuid(input.principalId, "principal id");
  return getAppDb().transaction(async (tx) => {
    await applySettings(tx, {
      ...cleared,
      "app.context": "identity",
      "app.issuer": input.issuer,
      "app.subject": input.subject,
      "app.principal_id": input.principalId ?? "",
    });
    return fn(tx);
  });
}

export async function withWorker<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getWorkerDb().transaction(async (tx) => {
    await applySettings(tx, {
      ...cleared,
      "app.context": "worker",
      "app.worker_purpose": "outbox_drain",
    });
    return fn(tx);
  });
}

export async function withPublic<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getAppDb().transaction(async (tx) => {
    await applySettings(tx, {
      ...cleared,
      "app.context": "public",
    });
    return fn(tx);
  });
}
