import { AppError } from "@masulino/contracts";
import { rows, type Tx } from "@masulino/database";
import { sql } from "drizzle-orm";

export async function moduleEnabled(tx: Tx, moduleId: string): Promise<boolean> {
  const found = await rows<{ enabled: boolean }>(
    tx,
    sql`select enabled from module_entitlements where module_id = ${moduleId}`,
  );
  return found[0]?.enabled === true;
}

export async function requireModule(tx: Tx, moduleId: string): Promise<void> {
  if (!(await moduleEnabled(tx, moduleId))) throw new AppError("forbidden", "entitlement");
}

export async function locationTimezone(tx: Tx, locationId: string): Promise<string> {
  const found = await rows<{ timezone: string }>(
    tx,
    sql`select timezone from locations where id = ${locationId} and status = 'active'`,
  );
  const timezone = found[0]?.timezone;
  if (!timezone) throw new AppError("not_found", "location");
  return timezone;
}
