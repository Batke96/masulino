export type StaffCapabilities = {
  bookings: boolean;
  createBooking: boolean;
  families: boolean;
  team: boolean;
  reports: boolean;
  campaigns: boolean;
  portal: boolean;
  agents: boolean;
};

export function appVisible(id: string, capabilities: StaffCapabilities | null): boolean {
  if (!capabilities) return true;
  if (id === "bookings" || id === "birthdays") return capabilities.bookings;
  if (id === "families") return capabilities.families;
  if (id === "team") return capabilities.team;
  if (id === "reports") return capabilities.reports;
  if (id === "campaigns") return capabilities.campaigns;
  if (id === "portal") return capabilities.portal;
  return false;
}

export function viewVisible(view: string, capabilities: StaffCapabilities | null): boolean {
  if (!capabilities) return true;
  if (view === "today" || view === "apps" || view === "knowledge") return true;
  if (view === "agents") return capabilities.agents;
  if (view === "concept") return false;
  return appVisible(view, capabilities);
}
