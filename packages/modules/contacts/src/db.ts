import { AppError } from "@masulino/contracts";
import { rows, type Tx } from "@masulino/database";
import { sql } from "drizzle-orm";

export async function requireModule(tx: Tx, moduleId: string): Promise<void> {
  const found = await rows<{ enabled: boolean }>(
    tx,
    sql`select enabled from module_entitlements where module_id = ${moduleId}`,
  );
  if (found[0]?.enabled !== true) throw new AppError("forbidden", "entitlement");
}

export async function requireLocation(tx: Tx, locationId: string): Promise<void> {
  const found = await rows<{ id: string }>(
    tx,
    sql`select id from locations where id = ${locationId} and status = 'active'`,
  );
  if (!found[0]) throw new AppError("not_found", "location");
}
