export type StaffCapabilities = {
  bookings: boolean;
  createBooking: boolean;
  families: boolean;
  team: boolean;
  reports: boolean;
  campaigns: boolean;
  portal: boolean;
  agents: boolean;
  it: boolean;
  operations: boolean;
};

const signedOutApps = new Set(["bookings", "mappe", "team", "reports"]);

export function appVisible(id: string, capabilities: StaffCapabilities | null): boolean {
  if (!capabilities) return signedOutApps.has(id);
  if (id === "it") return capabilities.it;
  if (id === "bookings" || id === "mappe") return capabilities.bookings;
  if (id === "families") return capabilities.families;
  if (id === "team") return capabilities.team;
  if (id === "reports") return capabilities.reports;
  if (id === "campaigns") return capabilities.campaigns;
  if (id === "customers") return capabilities.families || capabilities.campaigns;
  if (id === "betrieb") return capabilities.operations;
  if (id === "portal") return capabilities.portal;
  if (id === "tickets" || id === "bistro") {
    return capabilities.bookings && capabilities.team && capabilities.families && capabilities.it;
  }
  return false;
}

export function viewVisible(view: string, capabilities: StaffCapabilities | null): boolean {
  if (!capabilities) return true;
  if (view === "today" || view === "knowledge") return true;
  if (view === "agents") return capabilities.agents;
  if (view === "concept") return false;
  return appVisible(view, capabilities);
}
