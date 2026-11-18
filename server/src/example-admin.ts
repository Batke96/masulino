import { moduleIds, type RoleKey } from "@masulino/contracts";
import { rows, withTenant } from "@masulino/database";
import { sql } from "drizzle-orm";

/** Public demo account. It keeps every staff role so the workplace menu can open. */
export const EXAMPLE_ADMIN_EMAIL = "user@example.test";

export const exampleAdminTenantRoles = [
  "tenant_owner",
  "tenant_administrator",
  "it",
] as const satisfies readonly RoleKey[];

export const exampleAdminLocationRoles = [
  "location_manager",
  "shift_lead",
  "reception",
  "employee",
] as const satisfies readonly RoleKey[];

export function isExampleAdmin(email: string): boolean {
  return email.trim().toLowerCase() === EXAMPLE_ADMIN_EMAIL;
}

/** Tenant-owner permissions stay dark until the module row is enabled. */
export function withExampleAdminEntitlements(
  current: Readonly<Record<string, boolean>>,
): Record<string, boolean> {
  const next: Record<string, boolean> = { ...current };
  for (const moduleId of moduleIds) next[moduleId] = true;
  return next;
}

export async function ensureExampleAdminGrants(tenantId: string, principalId: string): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    const membership = await rows<{ id: string }>(
      tx,
      sql`select id from memberships where principal_id = ${principalId} and status = 'active' limit 1`,
    );
    const membershipId = membership[0]?.id;
    if (!membershipId) return;

    for (const role of exampleAdminTenantRoles) {
      await tx.execute(sql`
        insert into grants (tenant_id, membership_id, role_key, location_id)
        values (${tenantId}, ${membershipId}, ${role}, null)
        on conflict (membership_id, role_key) where location_id is null do nothing
      `);
    }

    const locations = await rows<{ id: string }>(
      tx,
      sql`select id from locations where status = 'active' order by name`,
    );
    for (const location of locations) {
      for (const role of exampleAdminLocationRoles) {
        await tx.execute(sql`
          insert into grants (tenant_id, membership_id, role_key, location_id)
          values (${tenantId}, ${membershipId}, ${role}, ${location.id})
          on conflict (membership_id, role_key, location_id) where location_id is not null do nothing
        `);
      }
    }
  });
}
