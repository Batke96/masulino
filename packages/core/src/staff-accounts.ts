import { randomUUID } from "node:crypto";
import {
  AppError,
  type CreateStaffAccountInput,
  type RoleKey,
  roleKeys,
} from "@masulino/contracts";
import { rows, withTenant } from "@masulino/database";
import { sql } from "drizzle-orm";
import {
  canAssignRole,
  canRemoveGrants,
  roleNeedsLocation,
  rolesActorMayGrant,
  staffRoleOrder,
  type Grant,
} from "./authz/policy";
import {
  countActiveOwners,
  ensurePrincipal,
  insertAudit,
  requirePermission,
  type ActorContext,
} from "./platform";

export type StaffCredentialPort = {
  provision(input: { email: string; name: string; password: string }): Promise<{ subject: string }>;
  retire(subject: string): Promise<void>;
};

export type StaffPerson = {
  membershipId: string;
  name: string;
  email: string;
  roleKey: RoleKey;
  locationId: string | null;
  locationName: string | null;
  removable: boolean;
};

export type StaffDirectory = {
  people: StaffPerson[];
  roles: Array<{ roleKey: RoleKey; needsLocation: boolean }>;
  locations: Array<{ id: string; name: string }>;
};

const knownRoles = new Set<string>(roleKeys);

function assertAccountShape(input: CreateStaffAccountInput): { email: string; name: string } {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 1 || name.length > 120) throw new AppError("validation", "name");
  if (!email.includes("@") || email.length > 200) throw new AppError("validation", "email");
  if (input.password.length < 12 || input.password.length > 200) {
    throw new AppError("validation", "password_length");
  }
  if (roleNeedsLocation(input.roleKey) && !input.locationId) {
    throw new AppError("validation", "location_required");
  }
  if (!roleNeedsLocation(input.roleKey) && input.locationId) {
    throw new AppError("validation", "location_not_allowed");
  }
  return { email, name };
}

export async function listStaffDirectory(actor: ActorContext): Promise<StaffDirectory> {
  requirePermission(actor, "core.users.invite");
  return withTenant(actor.tenantId, async (tx) => {
    const membershipRows = await rows<{
      membership_id: string;
      display_name: string | null;
      email: string | null;
      role_key: string | null;
      location_id: string | null;
      location_name: string | null;
    }>(
      tx,
      sql`
        select m.id as membership_id, p.display_name, p.email, g.role_key, g.location_id, l.name as location_name
        from memberships m
        join principals p on p.id = m.principal_id
        left join grants g on g.membership_id = m.id
        left join locations l on l.id = g.location_id
        where m.status = 'active'
        order by p.display_name, g.role_key
      `,
    );
    const owners = await countActiveOwners(tx);
    const grouped = new Map<
      string,
      { name: string; email: string; grants: Grant[]; locationNames: Map<string, string | null> }
    >();
    for (const row of membershipRows) {
      const current = grouped.get(row.membership_id) ?? {
        name: row.display_name?.trim() || "Ohne Namen",
        email: row.email ?? "",
        grants: [],
        locationNames: new Map<string, string | null>(),
      };
      if (row.role_key && knownRoles.has(row.role_key)) {
        const roleKey = row.role_key as RoleKey;
        current.grants.push({ roleKey, locationId: row.location_id });
        current.locationNames.set(`${roleKey}:${row.location_id ?? ""}`, row.location_name);
      }
      grouped.set(row.membership_id, current);
    }
    const people: StaffPerson[] = [];
    for (const [membershipId, person] of grouped) {
      const primary = staffRoleOrder.find((role) => person.grants.some((grant) => grant.roleKey === role));
      const grant = person.grants.find((item) => item.roleKey === primary) ?? person.grants[0];
      if (!grant) continue;
      const isOwner = person.grants.some((item) => item.roleKey === "tenant_owner");
      people.push({
        membershipId,
        name: person.name,
        email: person.email,
        roleKey: grant.roleKey,
        locationId: grant.locationId,
        locationName: person.locationNames.get(`${grant.roleKey}:${grant.locationId ?? ""}`) ?? null,
        removable: canRemoveGrants(actor, person.grants) && !(isOwner && owners <= 1),
      });
    }
    people.sort((left, right) => left.name.localeCompare(right.name, "de"));
    const locations = await rows<{ id: string; name: string }>(
      tx,
      sql`
        select id, name from locations
        where status = 'active'
        order by case when slug = 'berlin' then 0 else 1 end, name
      `,
    );
    return {
      people,
      roles: rolesActorMayGrant(actor).map((roleKey) => ({
        roleKey,
        needsLocation: roleNeedsLocation(roleKey),
      })),
      locations,
    };
  });
}

export async function createStaffAccount(
  actor: ActorContext,
  input: CreateStaffAccountInput,
  correlationId: string,
  credentials: StaffCredentialPort,
): Promise<{ principalId: string; membershipId: string; email: string; roleKey: RoleKey }> {
  requirePermission(actor, "core.users.invite");
  if (!canAssignRole(actor, input.roleKey, input.locationId)) {
    throw new AppError("forbidden", "grant_outside_authority");
  }
  const { email, name } = assertAccountShape(input);
  await withTenant(actor.tenantId, async (tx) => {
    if (input.locationId) {
      const location = await rows<{ id: string }>(
        tx,
        sql`select id from locations where id = ${input.locationId} and status = 'active'`,
      );
      if (!location[0]) throw new AppError("not_found", "location");
    }
    const existing = await rows<{ status: string }>(
      tx,
      sql`
        select m.status
        from memberships m
        join principals p on p.id = m.principal_id
        where lower(p.email) = ${email}
      `,
    );
    if (existing.some((row) => row.status === "active")) {
      throw new AppError("conflict", "already_member");
    }
  });

  let subject: string | null = null;
  try {
    subject = (await credentials.provision({ email, name, password: input.password })).subject;
    const principalId = await ensurePrincipal({ id: subject, email, name });
    const membershipId = randomUUID();
    await withTenant(actor.tenantId, async (tx) => {
      await tx.execute(sql`
        insert into memberships (id, tenant_id, principal_id, status)
        values (${membershipId}, ${actor.tenantId}, ${principalId}, 'active')
      `);
      await tx.execute(sql`
        insert into grants (tenant_id, membership_id, role_key, location_id)
        values (${actor.tenantId}, ${membershipId}, ${input.roleKey}, ${input.locationId})
      `);
      await insertAudit(tx, {
        tenantId: actor.tenantId,
        locationId: input.locationId,
        actorPrincipalId: actor.principalId,
        action: "core.users.create",
        targetType: "principal",
        targetId: principalId,
        outcome: "success",
        correlationId,
        changes: { email, roleKey: input.roleKey, locationId: input.locationId },
      });
    });
    return { principalId, membershipId, email, roleKey: input.roleKey };
  } catch (error) {
    if (subject) {
      try {
        await credentials.retire(subject);
      } catch {
        console.error("staff login was not retired");
      }
    }
    throw error;
  }
}

export async function removeStaffAccount(
  actor: ActorContext,
  membershipId: string,
  correlationId: string,
  credentials: StaffCredentialPort,
): Promise<void> {
  requirePermission(actor, "core.users.invite");
  const subject = await withTenant(actor.tenantId, async (tx) => {
    const target = await rows<{ id: string; status: string; subject: string; email: string | null }>(
      tx,
      sql`
        select m.id, m.status, p.subject, p.email
        from memberships m
        join principals p on p.id = m.principal_id
        where m.id = ${membershipId}
      `,
    );
    const membership = target[0];
    if (!membership || membership.status !== "active") throw new AppError("not_found", "membership");
    const grantRows = await rows<{ role_key: string; location_id: string | null }>(
      tx,
      sql`select role_key, location_id from grants where membership_id = ${membership.id}`,
    );
    const grants: Grant[] = grantRows
      .filter((row) => knownRoles.has(row.role_key))
      .map((row) => ({ roleKey: row.role_key as RoleKey, locationId: row.location_id }));
    if (!canRemoveGrants(actor, grants)) {
      throw new AppError("forbidden", "grant_outside_authority");
    }
    const isOwner = grants.some((grant) => grant.roleKey === "tenant_owner");
    if (isOwner && (await countActiveOwners(tx)) <= 1) {
      throw new AppError("last_owner", "last_owner");
    }
    await tx.execute(sql`
      update memberships set status = 'revoked', updated_at = now() where id = ${membership.id}
    `);
    await insertAudit(tx, {
      tenantId: actor.tenantId,
      actorPrincipalId: actor.principalId,
      action: "core.users.remove",
      targetType: "membership",
      targetId: membership.id,
      outcome: "success",
      correlationId,
      changes: {
        email: membership.email ?? "",
        roleKey: grants[0]?.roleKey ?? null,
        status: "revoked",
      },
    });
    return membership.subject;
  });
  try {
    await credentials.retire(subject);
  } catch {
    console.error("staff login was not retired");
    throw new AppError("conflict", "login_not_retired");
  }
}
