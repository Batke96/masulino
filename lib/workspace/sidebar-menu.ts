import { appVisible, type StaffCapabilities } from "./capabilities";

export type SidebarPhase = "MVP" | "Phase 2" | "Phase 3" | "Optional";

export type SidebarDestination = "today" | "bookings" | "team" | "reports" | "it";

export type SidebarEntry = {
  id: string;
  name: string;
  detail: string;
  phase?: SidebarPhase;
  destination?: SidebarDestination;
};

const laterAreas: SidebarEntry[] = [
  {
    id: "customers",
    name: "Kunden & Marketing",
    detail: "Kundenhistorie, Erinnerungen, Aktionen",
    phase: "Phase 3",
  },
  {
    id: "operations",
    name: "Betrieb",
    detail: "Checklisten, Aufgaben & Instandhaltung",
    phase: "Phase 3",
  },
  {
    id: "gastro",
    name: "Gastro & Lager",
    detail: "Bestände, Bedarfsplanung & Einkauf",
    phase: "Optional",
  },
];

export function sidebarMenu(capabilities: StaffCapabilities | null): {
  primary: SidebarEntry;
  apps: SidebarEntry[];
  settings: SidebarEntry | null;
} {
  const apps: SidebarEntry[] = [];
  if (appVisible("bookings", capabilities)) {
    apps.push({
      id: "bookings",
      name: "Buchungen",
      detail: "Reservierungen, Geburtstage & Tische",
      phase: "MVP",
      destination: "bookings",
    });
  }
  if (appVisible("team", capabilities)) {
    apps.push({
      id: "team",
      name: "Personal",
      detail: "Dienstplan, Verfügbarkeit & Zeiterfassung",
      phase: "Phase 2",
      destination: "team",
    });
  }
  if (appVisible("reports", capabilities)) {
    apps.push({
      id: "reports",
      name: "Auswertungen",
      detail: "Umsatz, Trends & Wirtschaftlichkeit",
      phase: "Phase 2",
      destination: "reports",
    });
  }
  apps.push(...laterAreas);
  return {
    primary: {
      id: "today",
      name: "Übersicht",
      detail: "Dein Chef-Dashboard",
      destination: "today",
    },
    apps,
    settings: appVisible("it", capabilities)
      ? {
          id: "it",
          name: "Verwaltung & Einstellungen",
          detail: "Standort, Raumplan, Preise, Regeln & Rechte",
          destination: "it",
        }
      : null,
  };
}

export function isSidebarDestination(id: string, capabilities: StaffCapabilities | null): boolean {
  const menu = sidebarMenu(capabilities);
  const entries = [menu.primary, ...menu.apps, menu.settings].filter((entry): entry is SidebarEntry => Boolean(entry));
  return entries.some((entry) => entry.destination === id);
}
