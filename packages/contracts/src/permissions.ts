export const actions = [
  "reservations.booking.read",
  "reservations.booking.create",
  "reservations.booking.update",
  "reservations.booking.cancel",
  "resources.manage",
  "content.notice.read",
  "content.notice.manage",
  "content.notice.publish",
  "core.users.invite",
  "core.roles.manage",
  "core.membership.read",
  "core.settings.read",
  "core.audit.read",
  "workforce.availability.read",
  "workforce.availability.write",
  "workforce.schedule.read",
  "workforce.schedule.propose",
  "workforce.schedule.publish",
  "workforce.time.read",
  "workforce.time.record",
  "workforce.time.correct",
  "workforce.time.approve",
  "workforce.compensation.read",
  "operations.checklist.read",
  "operations.checklist.complete",
  "operations.checklist.manage",
  "contacts.consent.read",
  "contacts.consent.write",
  "marketing.audience.read",
  "marketing.campaign.draft",
  "marketing.campaign.approve",
  "marketing.campaign.send",
  "loyalty.ledger.read",
  "loyalty.reward.issue",
  "loyalty.reward.redeem",
  "reporting.booked_value.read",
] as const;

export type Action = (typeof actions)[number];

export const roleKeys = [
  "tenant_owner",
  "tenant_administrator",
  "it",
  "location_manager",
  "shift_lead",
  "reception",
  "employee",
] as const;

export type RoleKey = (typeof roleKeys)[number];

export type PermissionScope = "tenant" | "location" | "none";

export const moduleIds = [
  "core",
  "reservations",
  "contacts",
  "notifications",
  "workforce",
  "marketing",
  "loyalty",
  "operations",
  "purchasing",
  "content",
] as const;

export type ModuleId = (typeof moduleIds)[number];

export type ModuleDefinition = {
  id: ModuleId;
  dependencies: readonly ModuleId[];
  defaultEnabled: boolean;
};

export const moduleRegistry: readonly ModuleDefinition[] = [
  { id: "core", dependencies: [], defaultEnabled: true },
  { id: "reservations", dependencies: ["core"], defaultEnabled: true },
  { id: "contacts", dependencies: ["core"], defaultEnabled: false },
  { id: "notifications", dependencies: ["core"], defaultEnabled: false },
  { id: "workforce", dependencies: ["core"], defaultEnabled: false },
  { id: "marketing", dependencies: ["contacts"], defaultEnabled: false },
  { id: "loyalty", dependencies: ["contacts"], defaultEnabled: false },
  { id: "operations", dependencies: ["core"], defaultEnabled: false },
  { id: "purchasing", dependencies: ["core"], defaultEnabled: false },
  { id: "content", dependencies: ["core"], defaultEnabled: false },
];

export function moduleForAction(action: Action): ModuleId {
  if (action.startsWith("core.")) return "core";
  if (action.startsWith("reservations.") || action === "resources.manage") return "reservations";
  if (action.startsWith("content.")) return "content";
  if (action.startsWith("workforce.")) return "workforce";
  if (action.startsWith("operations.")) return "operations";
  if (action.startsWith("contacts.")) return "contacts";
  if (action.startsWith("marketing.")) return "marketing";
  if (action.startsWith("loyalty.")) return "loyalty";
  if (action === "reporting.booked_value.read") return "reservations";
  return "core";
}
