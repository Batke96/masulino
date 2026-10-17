import { describe, expect, it } from "vitest";
import { actions, type Action, type RoleKey } from "@masulino/contracts";
import { authorize, canAssignRole, mfaSatisfiedForSession, permissionMatrix, redactChanges, rolesActorMayAssign } from "./policy";
import type { AuthzInput } from "./policy";

function actor(role: RoleKey, locationId: string | null, extra: Partial<AuthzInput> = {}): AuthzInput {
  return {
    membershipStatus: "active",
    grants: [{ roleKey: role, locationId }],
    entitlements: {
      core: true,
      reservations: true,
      workforce: true,
      operations: true,
      contacts: true,
      marketing: true,
      loyalty: true,
    },
    mfaSatisfied: true,
    ...extra,
  };
}

describe("permission matrix", () => {
  it("covers every action for every role", () => {
    const roles = Object.keys(permissionMatrix) as RoleKey[];
    expect(roles).toEqual([
      "tenant_owner",
      "tenant_administrator",
      "location_manager",
      "shift_lead",
      "reception",
      "it",
      "employee",
    ]);
    for (const role of roles) {
      expect(Object.keys(permissionMatrix[role]).sort()).toEqual([...actions].sort());
    }
  });

  it("allows reception to book only at the granted location", () => {
    expect(authorize(actor("reception", "loc-a", { locationId: "loc-a" }), "reservations.booking.create")).toEqual({
      allow: true,
    });
    expect(
      authorize(actor("reception", "loc-a", { locationId: "loc-b" }), "reservations.booking.create").allow,
    ).toBe(false);
    expect(authorize(actor("reception", "loc-a"), "resources.manage").allow).toBe(false);
  });

  it("denies employees, revoked members, and disabled modules", () => {
    expect(authorize(actor("employee", null, { locationId: "loc-a" }), "reservations.booking.read")).toEqual({
      allow: false,
      reason: "permission",
    });
    expect(
      authorize(actor("reception", "loc-a", { membershipStatus: "revoked", locationId: "loc-a" }), "reservations.booking.read"),
    ).toEqual({ allow: false, reason: "membership" });
    expect(
      authorize(
        actor("tenant_owner", null, { entitlements: { core: true, reservations: false } }),
        "reservations.booking.create",
      ),
    ).toEqual({ allow: false, reason: "entitlement" });
  });

  it("keeps privileged roles blocked until TOTP is enabled", () => {
    expect(
      mfaSatisfiedForSession({
        grants: [{ roleKey: "tenant_owner", locationId: null }],
        twoFactorEnabled: false,
        devBypass: false,
      }),
    ).toBe(false);
    expect(
      mfaSatisfiedForSession({
        grants: [{ roleKey: "location_manager", locationId: "loc-a" }],
        twoFactorEnabled: false,
        devBypass: false,
      }),
    ).toBe(false);
    expect(
      mfaSatisfiedForSession({
        grants: [{ roleKey: "tenant_administrator", locationId: null }],
        twoFactorEnabled: true,
        devBypass: false,
      }),
    ).toBe(true);
    expect(
      mfaSatisfiedForSession({
        grants: [{ roleKey: "it", locationId: null }],
        twoFactorEnabled: false,
        devBypass: false,
      }),
    ).toBe(false);
    expect(
      mfaSatisfiedForSession({
        grants: [{ roleKey: "reception", locationId: "loc-a" }],
        twoFactorEnabled: false,
        devBypass: false,
      }),
    ).toBe(true);
    expect(
      mfaSatisfiedForSession({
        grants: [{ roleKey: "tenant_owner", locationId: null }],
        twoFactorEnabled: false,
        devBypass: true,
      }),
    ).toBe(true);
  });

  it("requires MFA for privileged roles and keeps role management with the owner", () => {
    expect(
      authorize(actor("location_manager", "loc-a", { mfaSatisfied: false, locationId: "loc-a" }), "reservations.booking.read"),
    ).toEqual({ allow: false, reason: "mfa" });
    expect(authorize(actor("tenant_administrator", null), "core.roles.manage")).toEqual({
      allow: false,
      reason: "permission",
    });
    expect(authorize(actor("tenant_owner", null), "core.roles.manage").allow).toBe(true);
    expect(authorize(actor("shift_lead", "loc-a", { locationId: "loc-a" }), "reservations.booking.read").allow).toBe(
      true,
    );
    expect(authorize(actor("shift_lead", "loc-a", { locationId: "loc-a" }), "reservations.booking.create").allow).toBe(
      false,
    );
  });

  it("stops administrators from granting owner or manager roles", () => {
    const admin = actor("tenant_administrator", null);
    expect(canAssignRole(admin, "reception", "loc-a")).toBe(true);
    expect(canAssignRole(admin, "tenant_owner", null)).toBe(false);
    expect(canAssignRole(admin, "location_manager", "loc-a")).toBe(false);
    expect(canAssignRole(actor("reception", "loc-a"), "employee", "loc-a")).toBe(false);
    const itRole = actor("it", null);
    expect(canAssignRole(itRole, "it", null)).toBe(true);
    expect(canAssignRole(itRole, "tenant_administrator", null)).toBe(true);
    expect(canAssignRole(itRole, "location_manager", "loc-a")).toBe(true);
    expect(canAssignRole(itRole, "shift_lead", "loc-a")).toBe(true);
    expect(canAssignRole(itRole, "reception", "loc-a")).toBe(true);
    expect(canAssignRole(itRole, "employee", "loc-a")).toBe(true);
    expect(canAssignRole(itRole, "tenant_owner", null)).toBe(false);
    expect(canAssignRole(actor("tenant_owner", null), "it", null)).toBe(false);
    expect(canAssignRole(actor("tenant_owner", null), "reception", "loc-a")).toBe(true);
    expect(rolesActorMayAssign(itRole)).toEqual([
      "tenant_administrator",
      "location_manager",
      "shift_lead",
      "reception",
      "employee",
      "it",
    ]);
    expect(rolesActorMayAssign(actor("tenant_owner", null))).not.toContain("it");
    expect(rolesActorMayAssign(actor("tenant_administrator", null))).toEqual([
      "shift_lead",
      "reception",
      "employee",
    ]);
  });

  it("lets a location manager publish notices and keeps reception on read", () => {
    const entitlements = { core: true, reservations: true, content: true };
    expect(
      authorize(
        actor("location_manager", "loc-a", { locationId: "loc-a", entitlements }),
        "content.notice.publish",
      ),
    ).toEqual({ allow: true });
    expect(
      authorize(actor("reception", "loc-a", { locationId: "loc-a", entitlements }), "content.notice.publish"),
    ).toEqual({ allow: false, reason: "permission" });
    expect(
      authorize(
        actor("location_manager", "loc-a", {
          locationId: "loc-a",
          entitlements: { core: true, content: false },
        }),
        "content.notice.publish",
      ),
    ).toEqual({ allow: false, reason: "entitlement" });
  });

  it("keeps workforce and checklists on the conservative templates", () => {
    const location = { locationId: "loc-a" };
    expect(authorize(actor("employee", "loc-a", location), "workforce.availability.write")).toEqual({
      allow: true,
    });
    expect(authorize(actor("employee", "loc-a", location), "workforce.schedule.read")).toEqual({
      allow: true,
    });
    expect(authorize(actor("employee", "loc-a", location), "workforce.time.record")).toEqual({
      allow: true,
    });
    expect(authorize(actor("employee", "loc-a", location), "workforce.time.correct")).toEqual({
      allow: true,
    });
    expect(authorize(actor("employee", "loc-a", location), "operations.checklist.complete")).toEqual({
      allow: true,
    });
    expect(authorize(actor("employee", "loc-a", { locationId: "loc-b" }), "workforce.time.record")).toEqual({
      allow: false,
      reason: "location",
    });
    expect(authorize(actor("shift_lead", "loc-a", location), "workforce.schedule.read")).toEqual({
      allow: true,
    });
    expect(authorize(actor("shift_lead", "loc-a", location), "workforce.time.read")).toEqual({
      allow: true,
    });
    expect(authorize(actor("shift_lead", "loc-a", location), "operations.checklist.complete")).toEqual({
      allow: true,
    });
    expect(authorize(actor("location_manager", "loc-a", location), "workforce.schedule.publish")).toEqual({
      allow: true,
    });
    expect(authorize(actor("location_manager", "loc-a", location), "workforce.schedule.propose")).toEqual({
      allow: true,
    });
    expect(authorize(actor("location_manager", "loc-a", location), "workforce.time.approve")).toEqual({
      allow: true,
    });
    expect(authorize(actor("location_manager", "loc-a", location), "operations.checklist.manage")).toEqual({
      allow: true,
    });
    expect(authorize(actor("tenant_owner", null), "workforce.compensation.read")).toEqual({ allow: true });
    expect(authorize(actor("tenant_owner", null), "workforce.schedule.publish")).toEqual({ allow: true });
    expect(authorize(actor("tenant_owner", null), "operations.checklist.manage")).toEqual({ allow: true });
  });

  it("keeps contacts, marketing, loyalty, and booked value on the conservative templates", () => {
    const location = { locationId: "loc-a" };
    expect(authorize(actor("tenant_owner", null), "contacts.consent.write")).toEqual({ allow: true });
    expect(authorize(actor("tenant_owner", null), "marketing.campaign.approve")).toEqual({ allow: true });
    expect(authorize(actor("tenant_owner", null), "marketing.campaign.send")).toEqual({ allow: true });
    expect(authorize(actor("tenant_owner", null), "loyalty.reward.issue")).toEqual({ allow: true });
    expect(authorize(actor("tenant_owner", null), "loyalty.reward.redeem")).toEqual({ allow: true });
    expect(authorize(actor("tenant_owner", null), "reporting.booked_value.read")).toEqual({ allow: true });
    expect(authorize(actor("tenant_owner", null), "core.records.manage")).toEqual({ allow: true });
    expect(authorize(actor("it", null), "core.records.manage")).toEqual({ allow: true });
    expect(authorize(actor("it", null), "core.users.invite")).toEqual({ allow: true });
    expect(authorize(actor("it", null), "reservations.booking.update")).toEqual({ allow: true });
    expect(authorize(actor("it", null), "reporting.booked_value.read")).toEqual({ allow: true });
    expect(authorize(actor("it", null, { mfaSatisfied: false }), "core.records.manage")).toEqual({
      allow: false,
      reason: "mfa",
    });
    expect(authorize(actor("it", null), "core.roles.manage")).toEqual({ allow: false, reason: "permission" });
    expect(authorize(actor("it", null), "workforce.compensation.read")).toEqual({
      allow: false,
      reason: "permission",
    });
    expect(authorize(actor("location_manager", "loc-a", location), "marketing.audience.read")).toEqual({
      allow: true,
    });
    expect(authorize(actor("location_manager", "loc-a", location), "marketing.campaign.draft")).toEqual({
      allow: true,
    });
    expect(authorize(actor("location_manager", "loc-a", location), "reporting.booked_value.read")).toEqual({
      allow: true,
    });
    expect(authorize(actor("location_manager", "loc-a", location), "marketing.campaign.send")).toEqual({
      allow: false,
      reason: "permission",
    });
    expect(authorize(actor("location_manager", "loc-a", location), "marketing.campaign.approve")).toEqual({
      allow: false,
      reason: "permission",
    });
    expect(authorize(actor("reception", "loc-a", location), "marketing.audience.read")).toEqual({
      allow: false,
      reason: "permission",
    });
    expect(authorize(actor("employee", "loc-a", location), "loyalty.reward.redeem")).toEqual({
      allow: false,
      reason: "permission",
    });
    expect(authorize(actor("tenant_administrator", null), "marketing.campaign.approve")).toEqual({
      allow: false,
      reason: "permission",
    });
    expect(authorize(actor("shift_lead", "loc-a", location), "reporting.booked_value.read")).toEqual({
      allow: false,
      reason: "permission",
    });
  });

  it("denies contacts, marketing, and loyalty when the module is disabled", () => {
    expect(
      authorize(
        actor("tenant_owner", null, { entitlements: { core: true, contacts: false, marketing: true, loyalty: true } }),
        "contacts.consent.write",
      ),
    ).toEqual({ allow: false, reason: "entitlement" });
    expect(
      authorize(
        actor("tenant_owner", null, { entitlements: { core: true, contacts: true, marketing: false, loyalty: true } }),
        "marketing.campaign.draft",
      ),
    ).toEqual({ allow: false, reason: "entitlement" });
    expect(
      authorize(
        actor("tenant_owner", null, { entitlements: { core: true, contacts: true, marketing: true, loyalty: false } }),
        "loyalty.reward.redeem",
      ),
    ).toEqual({ allow: false, reason: "entitlement" });
    expect(
      authorize(
        actor("tenant_owner", null, { entitlements: { core: true, reservations: false } }),
        "reporting.booked_value.read",
      ),
    ).toEqual({ allow: false, reason: "entitlement" });
  });

  it("denies workforce and operations when the module is disabled", () => {
    expect(
      authorize(
        actor("tenant_owner", null, { entitlements: { core: true, workforce: false, operations: true } }),
        "workforce.schedule.propose",
      ),
    ).toEqual({ allow: false, reason: "entitlement" });
    expect(
      authorize(
        actor("location_manager", "loc-a", {
          locationId: "loc-a",
          entitlements: { core: true, workforce: true, operations: false },
        }),
        "operations.checklist.complete",
      ),
    ).toEqual({ allow: false, reason: "entitlement" });
    expect(
      authorize(
        actor("employee", "loc-a", {
          locationId: "loc-a",
          entitlements: { core: true, operations: false },
        }),
        "operations.checklist.read",
      ),
    ).toEqual({ allow: false, reason: "entitlement" });
  });

  it("redacts contact fields in audit changes", () => {
    expect(
      redactChanges({
        status: "confirmed",
        organizerEmail: "a@example.test",
        organizerPhone: "123",
        notes: "secret",
      }),
    ).toEqual({
      status: "confirmed",
      organizerEmail: "[redacted]",
      organizerPhone: "[redacted]",
      notes: "[redacted]",
    });
  });
});

describe("documented denies", () => {
  const denied: Array<[RoleKey, Action]> = [
    ["employee", "reservations.booking.read"],
    ["shift_lead", "reservations.booking.create"],
    ["reception", "resources.manage"],
    ["reception", "core.users.invite"],
    ["location_manager", "core.users.invite"],
    ["tenant_administrator", "core.roles.manage"],
    ["tenant_administrator", "core.audit.read"],
    ["reception", "content.notice.publish"],
    ["shift_lead", "content.notice.manage"],
    ["employee", "content.notice.read"],
    ["employee", "workforce.schedule.publish"],
    ["employee", "workforce.time.approve"],
    ["employee", "workforce.compensation.read"],
    ["shift_lead", "workforce.schedule.publish"],
    ["shift_lead", "workforce.time.approve"],
    ["shift_lead", "workforce.compensation.read"],
    ["shift_lead", "operations.checklist.manage"],
    ["reception", "workforce.time.record"],
    ["reception", "workforce.schedule.read"],
    ["reception", "operations.checklist.read"],
    ["tenant_administrator", "workforce.compensation.read"],
    ["tenant_administrator", "workforce.schedule.publish"],
    ["tenant_administrator", "operations.checklist.manage"],
    ["location_manager", "workforce.compensation.read"],
    ["location_manager", "marketing.campaign.approve"],
    ["location_manager", "marketing.campaign.send"],
    ["location_manager", "loyalty.reward.issue"],
    ["location_manager", "loyalty.reward.redeem"],
    ["location_manager", "contacts.consent.write"],
    ["reception", "marketing.audience.read"],
    ["reception", "marketing.campaign.draft"],
    ["reception", "marketing.campaign.send"],
    ["reception", "loyalty.reward.issue"],
    ["reception", "loyalty.reward.redeem"],
    ["reception", "reporting.booked_value.read"],
    ["employee", "marketing.audience.read"],
    ["employee", "reporting.booked_value.read"],
    ["employee", "loyalty.ledger.read"],
    ["shift_lead", "marketing.audience.read"],
    ["shift_lead", "loyalty.reward.redeem"],
    ["tenant_administrator", "marketing.campaign.approve"],
    ["tenant_administrator", "marketing.campaign.send"],
    ["tenant_administrator", "loyalty.reward.issue"],
    ["tenant_administrator", "contacts.consent.read"],
    ["tenant_administrator", "reporting.booked_value.read"],
    ["tenant_administrator", "core.records.manage"],
    ["location_manager", "core.records.manage"],
    ["reception", "core.records.manage"],
    ["employee", "core.records.manage"],
    ["it", "core.roles.manage"],
    ["it", "reservations.booking.create"],
    ["it", "workforce.compensation.read"],
  ];

  it.each(denied)("denies %s for %s", (role, action) => {
    const locationId = permissionMatrix[role][action] === "tenant" ? null : "loc-a";
    const decision = authorize(
      actor(role, locationId, { locationId: locationId ?? undefined }),
      action,
    );
    expect(decision.allow).toBe(false);
  });
});
