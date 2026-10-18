import type { Action, PermissionScope, RoleKey } from "@masulino/contracts";
import { moduleForAction, roleKeys } from "@masulino/contracts";

export type Grant = {
  roleKey: RoleKey;
  locationId: string | null;
};

export type MembershipStatus = "active" | "suspended" | "revoked";

export type AuthzInput = {
  membershipStatus: MembershipStatus;
  grants: readonly Grant[];
  entitlements: Readonly<Record<string, boolean>>;
  mfaSatisfied: boolean;
  locationId?: string | null;
};

export type AuthzReason = "membership" | "mfa" | "entitlement" | "permission" | "location";

export type AuthzDecision = { allow: true } | { allow: false; reason: AuthzReason };

const none = "none" as const;

type Matrix = Record<RoleKey, Record<Action, PermissionScope>>;

const noAccess = {
  "reservations.booking.read": none,
  "reservations.booking.create": none,
  "reservations.booking.update": none,
  "reservations.booking.cancel": none,
  "resources.manage": none,
  "content.notice.read": none,
  "content.notice.manage": none,
  "content.notice.publish": none,
  "core.users.invite": none,
  "core.roles.manage": none,
  "core.membership.read": none,
  "core.settings.read": none,
  "core.audit.read": none,
  "workforce.availability.read": none,
  "workforce.availability.write": none,
  "workforce.schedule.read": none,
  "workforce.schedule.propose": none,
  "workforce.schedule.publish": none,
  "workforce.time.read": none,
  "workforce.time.record": none,
  "workforce.time.correct": none,
  "workforce.time.approve": none,
  "workforce.compensation.read": none,
  "operations.checklist.read": none,
  "operations.checklist.complete": none,
  "operations.checklist.manage": none,
  "contacts.consent.read": none,
  "contacts.consent.write": none,
  "marketing.audience.read": none,
  "marketing.campaign.draft": none,
  "marketing.campaign.approve": none,
  "marketing.campaign.send": none,
  "loyalty.ledger.read": none,
  "loyalty.reward.issue": none,
  "loyalty.reward.redeem": none,
  "reporting.booked_value.read": none,
  "core.records.manage": none,
} satisfies Record<Action, PermissionScope>;

export const permissionMatrix: Matrix = {
  tenant_owner: {
    "reservations.booking.read": "tenant",
    "reservations.booking.create": "tenant",
    "reservations.booking.update": "tenant",
    "reservations.booking.cancel": "tenant",
    "resources.manage": "tenant",
    "content.notice.read": "tenant",
    "content.notice.manage": "tenant",
    "content.notice.publish": "tenant",
    "core.users.invite": "tenant",
    "core.roles.manage": "tenant",
    "core.membership.read": "tenant",
    "core.settings.read": "tenant",
    "core.audit.read": "tenant",
    "workforce.availability.read": "tenant",
    "workforce.availability.write": "tenant",
    "workforce.schedule.read": "tenant",
    "workforce.schedule.propose": "tenant",
    "workforce.schedule.publish": "tenant",
    "workforce.time.read": "tenant",
    "workforce.time.record": "tenant",
    "workforce.time.correct": "tenant",
    "workforce.time.approve": "tenant",
    "workforce.compensation.read": "tenant",
    "operations.checklist.read": "tenant",
    "operations.checklist.complete": "tenant",
    "operations.checklist.manage": "tenant",
    "contacts.consent.read": "tenant",
    "contacts.consent.write": "tenant",
    "marketing.audience.read": "tenant",
    "marketing.campaign.draft": "tenant",
    "marketing.campaign.approve": "tenant",
    "marketing.campaign.send": "tenant",
    "loyalty.ledger.read": "tenant",
    "loyalty.reward.issue": "tenant",
    "loyalty.reward.redeem": "tenant",
    "reporting.booked_value.read": "tenant",
    "core.records.manage": "tenant",
  },
  tenant_administrator: {
    "reservations.booking.read": "tenant",
    "reservations.booking.create": "tenant",
    "reservations.booking.update": "tenant",
    "reservations.booking.cancel": "tenant",
    "resources.manage": "tenant",
    "content.notice.read": "tenant",
    "content.notice.manage": "tenant",
    "content.notice.publish": "tenant",
    "core.users.invite": "tenant",
    "core.roles.manage": none,
    "core.membership.read": "tenant",
    "core.settings.read": "tenant",
    "core.audit.read": none,
    "workforce.availability.read": none,
    "workforce.availability.write": none,
    "workforce.schedule.read": none,
    "workforce.schedule.propose": none,
    "workforce.schedule.publish": none,
    "workforce.time.read": none,
    "workforce.time.record": none,
    "workforce.time.correct": none,
    "workforce.time.approve": none,
    "workforce.compensation.read": none,
    "operations.checklist.read": none,
    "operations.checklist.complete": none,
    "operations.checklist.manage": none,
    "contacts.consent.read": none,
    "contacts.consent.write": none,
    "marketing.audience.read": none,
    "marketing.campaign.draft": none,
    "marketing.campaign.approve": none,
    "marketing.campaign.send": none,
    "loyalty.ledger.read": none,
    "loyalty.reward.issue": none,
    "loyalty.reward.redeem": none,
    "reporting.booked_value.read": none,
    "core.records.manage": none,
  },
  location_manager: {
    "reservations.booking.read": "location",
    "reservations.booking.create": "location",
    "reservations.booking.update": "location",
    "reservations.booking.cancel": "location",
    "resources.manage": "location",
    "content.notice.read": "location",
    "content.notice.manage": "location",
    "content.notice.publish": "location",
    "core.users.invite": none,
    "core.roles.manage": none,
    "core.membership.read": "location",
    "core.settings.read": "location",
    "core.audit.read": none,
    "workforce.availability.read": "location",
    "workforce.availability.write": none,
    "workforce.schedule.read": "location",
    "workforce.schedule.propose": "location",
    "workforce.schedule.publish": "location",
    "workforce.time.read": "location",
    "workforce.time.record": none,
    "workforce.time.correct": none,
    "workforce.time.approve": "location",
    "workforce.compensation.read": none,
    "operations.checklist.read": "location",
    "operations.checklist.complete": "location",
    "operations.checklist.manage": "location",
    "contacts.consent.read": none,
    "contacts.consent.write": none,
    "marketing.audience.read": "location",
    "marketing.campaign.draft": "location",
    "marketing.campaign.approve": none,
    "marketing.campaign.send": none,
    "loyalty.ledger.read": none,
    "loyalty.reward.issue": none,
    "loyalty.reward.redeem": none,
    "reporting.booked_value.read": "location",
    "core.records.manage": none,
  },
  shift_lead: {
    ...noAccess,
    "reservations.booking.read": "location",
    "content.notice.read": "location",
    "workforce.schedule.read": "location",
    "workforce.time.read": "location",
    "operations.checklist.read": "location",
    "operations.checklist.complete": "location",
  },
  reception: {
    "reservations.booking.read": "location",
    "reservations.booking.create": "location",
    "reservations.booking.update": "location",
    "reservations.booking.cancel": "location",
    "resources.manage": none,
    "content.notice.read": "location",
    "content.notice.manage": none,
    "content.notice.publish": none,
    "core.users.invite": none,
    "core.roles.manage": none,
    "core.membership.read": none,
    "core.settings.read": none,
    "core.audit.read": none,
    "workforce.availability.read": none,
    "workforce.availability.write": none,
    "workforce.schedule.read": none,
    "workforce.schedule.propose": none,
    "workforce.schedule.publish": none,
    "workforce.time.read": none,
    "workforce.time.record": none,
    "workforce.time.correct": none,
    "workforce.time.approve": none,
    "workforce.compensation.read": none,
    "operations.checklist.read": none,
    "operations.checklist.complete": none,
    "operations.checklist.manage": none,
    "contacts.consent.read": none,
    "contacts.consent.write": none,
    "marketing.audience.read": none,
    "marketing.campaign.draft": none,
    "marketing.campaign.approve": none,
    "marketing.campaign.send": none,
    "loyalty.ledger.read": none,
    "loyalty.reward.issue": none,
    "loyalty.reward.redeem": none,
    "reporting.booked_value.read": none,
    "core.records.manage": none,
  },
  it: {
    ...noAccess,
    "core.users.invite": "tenant",
    "core.membership.read": "tenant",
    "core.settings.read": "tenant",
    "core.audit.read": "tenant",
    "core.records.manage": "tenant",
    "reservations.booking.read": "tenant",
    "reservations.booking.update": "tenant",
    "reservations.booking.cancel": "tenant",
    "resources.manage": "tenant",
    "reporting.booked_value.read": "tenant",
  },
  employee: {
    ...noAccess,
    "workforce.availability.read": "location",
    "workforce.availability.write": "location",
    "workforce.schedule.read": "location",
    "workforce.time.read": "location",
    "workforce.time.record": "location",
    "workforce.time.correct": "location",
    "operations.checklist.read": "location",
    "operations.checklist.complete": "location",
  },
};

export const privilegedRoles = [
  "tenant_owner",
  "tenant_administrator",
  "location_manager",
  "it",
] as const satisfies readonly RoleKey[];

export const grantableRoles: Record<RoleKey, readonly RoleKey[]> = {
  tenant_owner: [
    "tenant_owner",
    "tenant_administrator",
    "location_manager",
    "shift_lead",
    "reception",
    "employee",
  ],
  tenant_administrator: ["shift_lead", "reception", "employee"],
  it: ["it", "tenant_administrator", "location_manager", "shift_lead", "reception", "employee"],
  location_manager: [],
  shift_lead: [],
  reception: [],
  employee: [],
};

export function holdsPrivilegedGrant(grants: readonly Grant[]): boolean {
  return grants.some((grant) =>
    (privilegedRoles as readonly string[]).includes(grant.roleKey),
  );
}

/**
 * Privileged roles stay blocked until this session's user has completed TOTP.
 * `devBypass` is only for the local `MASULINO_DEV_SESSION` path, which production refuses.
 */
export function mfaSatisfiedForSession(input: {
  grants: readonly Grant[];
  twoFactorEnabled: boolean;
  devBypass: boolean;
}): boolean {
  if (input.devBypass) return true;
  if (!holdsPrivilegedGrant(input.grants)) return true;
  return input.twoFactorEnabled;
}

function holdsPrivilegedRole(grants: readonly Grant[]): boolean {
  return holdsPrivilegedGrant(grants);
}

export function authorize(input: AuthzInput, action: Action): AuthzDecision {
  if (input.membershipStatus !== "active") {
    return { allow: false, reason: "membership" };
  }

  const moduleId = moduleForAction(action);
  if (input.entitlements[moduleId] !== true) {
    return { allow: false, reason: "entitlement" };
  }

  if (holdsPrivilegedRole(input.grants) && !input.mfaSatisfied) {
    return { allow: false, reason: "mfa" };
  }

  const matching = input.grants.filter(
    (grant) => permissionMatrix[grant.roleKey][action] !== "none",
  );
  if (matching.length === 0) {
    return { allow: false, reason: "permission" };
  }

  const tenantWide = matching.some(
    (grant) =>
      permissionMatrix[grant.roleKey][action] === "tenant" && grant.locationId === null,
  );
  if (tenantWide) return { allow: true };

  if (!input.locationId) {
    return { allow: false, reason: "location" };
  }

  const atLocation = matching.some(
    (grant) =>
      permissionMatrix[grant.roleKey][action] === "location" &&
      grant.locationId === input.locationId,
  );
  if (atLocation) return { allow: true };
  return { allow: false, reason: "location" };
}

export function allowedActions(input: AuthzInput): Action[] {
  const keys = Object.keys(permissionMatrix.tenant_owner) as Action[];
  return keys.filter((action) => authorize(input, action).allow);
}

export function canAssignRole(
  actor: AuthzInput,
  targetRole: RoleKey,
  targetLocationId: string | null,
): boolean {
  const invite = authorize(actor, "core.users.invite");
  if (!invite.allow) return false;
  const allowed = actor.grants.some((grant) =>
    grantableRoles[grant.roleKey].includes(targetRole),
  );
  if (!allowed) return false;
  const tenantWide = actor.grants.some(
    (grant) => grant.locationId === null && grantableRoles[grant.roleKey].includes(targetRole),
  );
  if (tenantWide) return true;
  if (!targetLocationId) return false;
  return actor.grants.some(
    (grant) =>
      grant.locationId === targetLocationId && grantableRoles[grant.roleKey].includes(targetRole),
  );
}

const tenantWideAssignable = new Set<RoleKey>(["tenant_owner", "tenant_administrator", "it"]);

/** Roles this actor may pass to inviteStaff. Location roles use a sample location because a tenant-wide grant covers every site. */
export function rolesActorMayAssign(actor: AuthzInput): RoleKey[] {
  const sampleLocation = "00000000-0000-4000-8000-000000000001";
  return roleKeys.filter((role) =>
    canAssignRole(actor, role, tenantWideAssignable.has(role) ? null : sampleLocation),
  );
}

const sensitiveKey = /email|phone|password|token|secret|cookie|authorization|notes/i;

export function redactChanges(input: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    redacted[key] = sensitiveKey.test(key) ? "[redacted]" : value;
  }
  return redacted;
}
