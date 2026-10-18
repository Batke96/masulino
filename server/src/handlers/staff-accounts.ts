import { randomUUID } from "node:crypto";
import { AppError, createStaffAccountSchema, removeStaffAccountSchema } from "@masulino/contracts";
import { createStaffAccount, listAccountDirectory, removeStaffAccount } from "@masulino/core";
import { errorResponse, json } from "../errors";
import { staffCredentials } from "../staff-credentials";
import { requireActor, requireStaffSession, roleLabel } from "../session";

async function actorFor(request: Request) {
  const staff = await requireStaffSession(request);
  const membership = staff.memberships.find((item) => item.status === "active");
  if (!membership) throw new AppError("forbidden", "membership");
  return requireActor(request, membership.tenant_id);
}

export async function handleListStaff(request: Request): Promise<Response> {
  try {
    const actor = await actorFor(request);
    const directory = await listAccountDirectory(actor);
    return json({
      people: directory.people.map((person) => ({
        ...person,
        roleLabel: roleLabel(person.roleKey),
      })),
      roles: directory.roles.map((role) => ({
        ...role,
        label: roleLabel(role.roleKey),
      })),
      locations: directory.locations,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleCreateStaff(request: Request): Promise<Response> {
  try {
    const actor = await actorFor(request);
    const body: unknown = await request.json().catch(() => null);
    const parsed = createStaffAccountSchema.safeParse(body);
    if (!parsed.success) throw new AppError("validation", "invalid_staff_account");
    const created = await createStaffAccount(actor, parsed.data, randomUUID(), staffCredentials);
    return json({
      membershipId: created.membershipId,
      name: parsed.data.name.trim(),
      email: created.email,
      roleKey: created.roleKey,
      roleLabel: roleLabel(created.roleKey),
      password: parsed.data.password,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleRemoveStaff(request: Request): Promise<Response> {
  try {
    const actor = await actorFor(request);
    const body: unknown = await request.json().catch(() => null);
    const parsed = removeStaffAccountSchema.safeParse(body);
    if (!parsed.success) throw new AppError("validation", "invalid_staff_account");
    await removeStaffAccount(actor, parsed.data.membershipId, randomUUID(), staffCredentials);
    return json({ removed: true });
  } catch (error) {
    return errorResponse(error);
  }
}
