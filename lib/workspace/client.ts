/**
 * Thin client for the Node domain adapter.
 * A signed-in staff session turns live sections on.
 * `VITE_MASULINO_FIXTURES=1` keeps the original fixture walkthrough.
 */

export type BookingViewModel = {
  id: string;
  time: string;
  name: string;
  detail: string;
  type: string;
  color: string;
  reference: string;
  status: string;
  version: number;
  packageName: string;
  childrenCount: number;
  adultCount: number;
  tables: string[];
};

export type WorkspaceBootstrap = {
  source: "live";
  tenantId: string;
  tenantSlug: string;
  locationId: string;
  locationSlug: string;
  locationName: string;
  timezone: string;
  localDate: string;
  allowedActions: string[];
};

export type FamilyRow = {
  id: string;
  name: string;
  lastVisit: string;
  points: number;
  consent: boolean;
  longAbsent: boolean;
};

export type PackageOption = {
  id: string;
  name: string;
  price_minor: number;
  currency: string;
};

function fixtureMode(): boolean {
  if (typeof window === "undefined") return false;
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  return env.VITE_MASULINO_FIXTURES === "1";
}

function workspaceEnabled(): boolean {
  if (typeof window === "undefined" || fixtureMode()) return false;
  return window.localStorage.getItem("masulino.workspace") === "1"
    || Boolean((window as Window & { __MASULINO_WORKSPACE__?: boolean }).__MASULINO_WORKSPACE__);
}

export function enableWorkspace(): void {
  if (typeof window === "undefined" || fixtureMode()) return;
  window.localStorage.setItem("masulino.workspace", "1");
  (window as Window & { __MASULINO_WORKSPACE__?: boolean }).__MASULINO_WORKSPACE__ = true;
}

/** Call once from the shell when the Vite env flag is present. */
export function enableWorkspaceFromEnv(): void {
  if (typeof window === "undefined" || fixtureMode()) return;
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  if (env.VITE_MASULINO_WORKSPACE === "1" || env.MASULINO_WORKSPACE === "1") {
    enableWorkspace();
  }
}

export function isWorkspaceMode(): boolean {
  return workspaceEnabled();
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path, {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string; alternatives?: string[] }> {
  try {
    const response = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as T & { error?: string; alternatives?: string[] };
    if (!response.ok) {
      return {
        ok: false,
        error: data.error ?? "generic",
        alternatives: data.alternatives,
      };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "generic" };
  }
}

export async function fetchBootstrap(): Promise<WorkspaceBootstrap | null> {
  if (!isWorkspaceMode()) return null;
  return getJson<WorkspaceBootstrap>("/api/workspace");
}

export async function fetchSectionBookings(
  section: "bookings" | "birthdays",
  date?: string,
): Promise<BookingViewModel[] | null> {
  if (!isWorkspaceMode()) return null;
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  const data = await getJson<{ source: string; bookings: BookingViewModel[] }>(
    `/api/sections/${section}${query}`,
  );
  if (!data || data.source !== "live") return null;
  return data.bookings;
}

export async function fetchFamilies(): Promise<FamilyRow[] | null> {
  if (!isWorkspaceMode()) return null;
  const data = await getJson<{ source: string; families: FamilyRow[] }>("/api/sections/families");
  if (!data || data.source !== "live") return null;
  return data.families;
}

export async function fetchPackages(): Promise<PackageOption[] | null> {
  if (!isWorkspaceMode()) return null;
  const data = await getJson<{ source: string; packages: PackageOption[] }>("/api/packages");
  if (!data || data.source !== "live") return null;
  return data.packages;
}

export async function createBooking(input: {
  idempotencyKey: string;
  organizerName: string;
  childrenCount: number;
  adultCount?: number;
  packageId: string;
  localDate?: string;
  localTime?: string;
  organizerEmail?: string;
  organizerPhone?: string;
}): Promise<
  | { ok: true; booking: BookingViewModel; reference: string }
  | { ok: false; error: string; alternatives?: string[] }
> {
  if (!isWorkspaceMode()) {
    return { ok: false, error: "fixture_only" };
  }
  const result = await postJson<{ booking: BookingViewModel; reference: string }>(
    "/api/bookings",
    input,
  );
  if (!result.ok) return result;
  if (!result.data.booking) return { ok: false, error: "generic" };
  return {
    ok: true,
    booking: result.data.booking,
    reference: result.data.reference,
  };
}

export async function fetchReports(): Promise<{
  bookedValueMinor: number;
  currency: string;
  collectedPayments: { connected: boolean };
} | null> {
  if (!isWorkspaceMode()) return null;
  const data = await getJson<{
    source: string;
    report: {
      bookedValueMinor: number;
      currency: string;
      collectedPayments: { connected: boolean };
    };
  }>("/api/sections/reports");
  if (!data || data.source !== "live") return null;
  return data.report;
}

export async function fetchCampaignsLive(): Promise<{
  audienceCount: number;
  campaigns: Array<{ id: string; status: string; body: string }>;
} | null> {
  if (!isWorkspaceMode()) return null;
  const data = await getJson<{
    source: string;
    audience: unknown[];
    campaigns: Array<{ id: string; status: string; body: string }>;
  }>("/api/sections/campaigns");
  if (!data || data.source !== "live") return null;
  return {
    audienceCount: data.audience.length,
    campaigns: data.campaigns,
  };
}

export async function fetchPortalNotices(): Promise<
  Array<{ id: string; title: string; body: string; status: string }> | null
> {
  if (!isWorkspaceMode()) return null;
  const data = await getJson<{
    source: string;
    notices: Array<{ id: string; title: string; body: string; status: string }>;
  }>("/api/sections/portal");
  if (!data || data.source !== "live") return null;
  return data.notices;
}

export async function fetchTeamLive(): Promise<{ source: "live" } | null> {
  if (!isWorkspaceMode()) return null;
  const data = await getJson<{ source: string }>("/api/sections/team");
  if (!data || data.source !== "live") return null;
  return { source: "live" };
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
