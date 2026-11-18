import { describe, expect, it } from "vitest";
import { staffCapabilities } from "./capabilities";
import {
  EXAMPLE_ADMIN_EMAIL,
  exampleAdminLocationRoles,
  exampleAdminTenantRoles,
  isExampleAdmin,
  withExampleAdminEntitlements,
} from "./example-admin";

describe("example admin", () => {
  it("recognises only the public demo address", () => {
    expect(isExampleAdmin(" user@example.test ")).toBe(true);
    expect(isExampleAdmin("owner.masulino@example.test")).toBe(false);
  });

  it("covers every staff role", () => {
    expect([...exampleAdminTenantRoles, ...exampleAdminLocationRoles]).toEqual([
      "tenant_owner",
      "tenant_administrator",
      "it",
      "location_manager",
      "shift_lead",
      "reception",
      "employee",
    ]);
  });

  it("turns the workplace sections on even when the tenant only enabled reservations", () => {
    const entitlements = withExampleAdminEntitlements({ core: true, reservations: true });
    const capabilities = staffCapabilities(
      {
        principalId: "00000000-0000-4000-8000-000000000001",
        tenantId: "00000000-0000-4000-8000-000000000002",
        membershipStatus: "active",
        grants: [{ roleKey: "tenant_owner", locationId: null }],
        entitlements,
        mfaSatisfied: true,
      },
      "00000000-0000-4000-8000-000000000003",
    );
    expect(EXAMPLE_ADMIN_EMAIL).toBe("user@example.test");
    expect(capabilities).toMatchObject({
      bookings: true,
      createBooking: true,
      families: true,
      team: true,
      reports: true,
      campaigns: true,
      portal: true,
      it: true,
    });
  });
});
