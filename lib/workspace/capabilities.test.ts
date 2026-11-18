import { describe, expect, it } from "vitest";
import { appVisible, type StaffCapabilities } from "./capabilities";

const owner: StaffCapabilities = {
  bookings: true,
  createBooking: true,
  families: false,
  team: false,
  reports: true,
  campaigns: false,
  portal: false,
  agents: false,
  it: true,
  operations: false,
};

const exampleAdmin: StaffCapabilities = {
  ...owner,
  families: true,
  team: true,
  campaigns: true,
  portal: true,
  operations: true,
};

describe("app visibility", () => {
  it("keeps the signed-out menu on the four workplace apps", () => {
    expect(["bookings", "mappe", "team", "reports"].every((id) => appVisible(id, null))).toBe(true);
    expect(appVisible("it", null)).toBe(false);
    expect(appVisible("families", null)).toBe(false);
    expect(appVisible("tickets", null)).toBe(false);
  });

  it("hides Team until the workforce permission is present", () => {
    expect(appVisible("team", owner)).toBe(false);
    expect(appVisible("team", exampleAdmin)).toBe(true);
  });

  it("shows Kasse, Bistro and IT only for the account that can open every section", () => {
    expect(appVisible("tickets", owner)).toBe(false);
    expect(appVisible("bistro", owner)).toBe(false);
    expect(appVisible("it", owner)).toBe(true);
    expect(appVisible("tickets", exampleAdmin)).toBe(true);
    expect(appVisible("bistro", exampleAdmin)).toBe(true);
    expect(appVisible("families", exampleAdmin)).toBe(true);
    expect(appVisible("campaigns", exampleAdmin)).toBe(true);
  });

  it("opens Kunden und Betrieb only with the matching permission", () => {
    expect(appVisible("customers", null)).toBe(false);
    expect(appVisible("betrieb", null)).toBe(false);
    expect(appVisible("customers", owner)).toBe(false);
    expect(appVisible("customers", { ...owner, families: true })).toBe(true);
    expect(appVisible("customers", { ...owner, campaigns: true })).toBe(true);
    expect(appVisible("betrieb", owner)).toBe(false);
    expect(appVisible("betrieb", { ...owner, operations: true })).toBe(true);
  });
});
