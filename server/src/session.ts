import {
  ensurePrincipal,
  listMemberships,
  loadActor,
  type ActorContext,
} from "@masulino/core";
import { AppError } from "@masulino/contracts";
import { getAuthDb, rows, withTenant } from "@masulino/database";
import { sql } from "drizzle-orm";
import { getAuth } from "./auth";
import { staffCapabilities } from "./capabilities";
import { allowDevSession } from "./env";
import { json } from "./errors";

const DEV_OWNER_EMAIL = "owner.masulino@example.test";

export type StaffSession = {
  user: { id: string; email: string; name: string };
  principalId: string;
  memberships: Awaited<ReturnType<typeof listMemberships>>;
  source: "session" | "dev";
};

export async function getStaffSession(request: Request): Promise<StaffSession | null> {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session) {
    const principalId = await ensurePrincipal({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    });
    const memberships = await listMemberships(principalId, session.user.id);
    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
      principalId,
      memberships,
      source: "session",
    };
  }

  if (!allowDevSession()) return null;
  return loadDevOwnerSession();
}

async function loadDevOwnerSession(): Promise<StaffSession | null> {
  const authDb = getAuthDb();
  const result = await authDb.execute(sql`
    select id, email, name
    from identity."user"
    where email = ${DEV_OWNER_EMAIL}
    limit 1
  `);
  const found = (
    Array.isArray(result)
      ? result
      : ((result as unknown as { rows: unknown[] }).rows ?? [])
  ) as Array<{ id: string; email: string; name: string }>;
  const user = found[0];
  if (!user) return null;
  const principalId = await ensurePrincipal({
    id: user.id,
    email: user.email,
    name: user.name,
  });
  const memberships = await listMemberships(principalId, user.id);
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    principalId,
    memberships,
    source: "dev",
  };
}

const roleLabels: Record<string, string> = {
  tenant_owner: "Inhaber",
  tenant_administrator: "Verwaltung",
  location_manager: "Standortleitung",
  shift_lead: "Schichtleitung",
  reception: "Empfang",
  employee: "Team",
};

const roleOrder = [
  "tenant_owner",
  "tenant_administrator",
  "location_manager",
  "shift_lead",
  "reception",
  "employee",
];

function primaryRole(grants: ReadonlyArray<{ roleKey: string }>): string {
  return roleOrder.find((role) => grants.some((grant) => grant.roleKey === role)) ?? grants[0]?.roleKey ?? "employee";
}

export function describeRole(grants: ReadonlyArray<{ roleKey: string }>): {
  roleKey: string;
  roleLabel: string;
} {
  const roleKey = primaryRole(grants);
  return { roleKey, roleLabel: roleLabels[roleKey] ?? roleKey };
}

function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function handleStaffSession(request: Request): Promise<Response> {
  const staff = await getStaffSession(request);
  if (!staff) return json({ authenticated: false }, 401);

  const membership = staff.memberships.find((item) => item.status === "active");
  if (!membership) return json({ authenticated: true, access: "none" }, 403);

  const actor = await loadActor({
    principalId: staff.principalId,
    tenantId: membership.tenant_id,
    mfaSatisfied: true,
  });
  if (!actor || actor.membershipStatus !== "active") {
    return json({ authenticated: true, access: "none" }, 403);
  }

  const { roleKey, roleLabel } = describeRole(actor.grants);
  const scope = await resolveDefaultScope(request);
  const capabilities = staffCapabilities(scope.actor, scope.locationId);

  return json({
    authenticated: true,
    access: "active",
    source: staff.source,
    user: { name: staff.user.name, email: staff.user.email },
    roleKey,
    roleLabel,
    tenantName: membership.tenant_name,
    tenantSlug: membership.tenant_slug,
    locationName: scope.locationName,
    localDate: todayInTimezone(scope.timezone),
    capabilities,
  });
}

export async function requireStaffSession(request: Request): Promise<StaffSession> {
  const staff = await getStaffSession(request);
  if (!staff) throw new AppError("unauthenticated", "session");
  return staff;
}

export async function requireActor(request: Request, tenantId: string): Promise<ActorContext> {
  const staff = await requireStaffSession(request);
  const actor = await loadActor({
    principalId: staff.principalId,
    tenantId,
    mfaSatisfied: true,
  });
  if (!actor || actor.membershipStatus !== "active") {
    throw new AppError("forbidden", "membership");
  }
  return actor;
}

export async function resolveDefaultScope(request: Request): Promise<{
  actor: ActorContext;
  tenantId: string;
  tenantSlug: string;
  locationId: string;
  locationSlug: string;
  locationName: string;
  timezone: string;
}> {
  const staff = await requireStaffSession(request);
  const membership = staff.memberships.find((item) => item.status === "active");
  if (!membership) throw new AppError("forbidden", "membership");

  const actor = await requireActor(request, membership.tenant_id);
  const found = await withTenant(actor.tenantId, async (tx) =>
    rows<{
      id: string;
      slug: string;
      name: string;
      timezone: string;
      tenant_slug: string;
    }>(
      tx,
      sql`
        select l.id, l.slug, l.name, l.timezone, t.slug as tenant_slug
        from locations l
        join tenants t on t.id = l.tenant_id
        where l.status = 'active'
        order by case when l.slug = 'berlin' then 0 else 1 end, l.name
        limit 1
      `,
    ),
  );
  const location = found[0];
  if (!location) throw new AppError("not_found", "location");
  return {
    actor,
    tenantId: actor.tenantId,
    tenantSlug: location.tenant_slug,
    locationId: location.id,
    locationSlug: location.slug,
    locationName: location.name,
    timezone: location.timezone,
  };
}
