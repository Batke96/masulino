import { describe, expect, it } from "vitest";
import type { StaffCapabilities } from "./capabilities";
import { isSidebarDestination, sidebarMenu } from "./sidebar-menu";

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
};

const exampleAdmin: StaffCapabilities = {
  ...owner,
  families: true,
  team: true,
  campaigns: true,
  portal: true,
};

const employee: StaffCapabilities = {
  ...owner,
  bookings: false,
  createBooking: false,
  reports: false,
  it: false,
  team: true,
};

function names(capabilities: StaffCapabilities | null): string[] {
  const menu = sidebarMenu(capabilities);
  return [menu.primary, ...menu.apps, ...(menu.settings ? [menu.settings] : [])].map((entry) => entry.name);
}

describe("sidebar menu", () => {
  it("lists the agreed sections and leaves the extra workplace apps out", () => {
    expect(names(exampleAdmin)).toEqual([
      "Übersicht",
      "Buchungen",
      "Personal",
      "Auswertungen",
      "Kunden & Marketing",
      "Betrieb",
      "Gastro & Lager",
      "Verwaltung & Einstellungen",
    ]);
    expect(isSidebarDestination("mappe", exampleAdmin)).toBe(false);
    expect(isSidebarDestination("tickets", exampleAdmin)).toBe(false);
    expect(isSidebarDestination("bistro", exampleAdmin)).toBe(false);
    expect(isSidebarDestination("families", exampleAdmin)).toBe(false);
    expect(isSidebarDestination("campaigns", exampleAdmin)).toBe(false);
  });

  it("keeps Buchungen, Personal and Auswertungen for the signed-out workplace", () => {
    expect(names(null)).toEqual([
      "Übersicht",
      "Buchungen",
      "Personal",
      "Auswertungen",
      "Kunden & Marketing",
      "Betrieb",
      "Gastro & Lager",
    ]);
    expect(sidebarMenu(null).settings).toBeNull();
  });

  it("hides a working area when the role cannot open it", () => {
    expect(names(owner)).not.toContain("Personal");
    expect(names(employee)).not.toContain("Buchungen");
    expect(names(employee)).not.toContain("Auswertungen");
    expect(names(employee)).not.toContain("Verwaltung & Einstellungen");
    expect(isSidebarDestination("team", employee)).toBe(true);
    expect(isSidebarDestination("bookings", owner)).toBe(true);
    expect(sidebarMenu(exampleAdmin).apps.find((entry) => entry.id === "team")?.destination).toBe("team");
  });
});
