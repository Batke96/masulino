/**
 * Thin client for the Node domain adapter.
 * A signed-in staff session turns live sections on.
 * `VITE_MASULINO_FIXTURES=1` keeps the original fixture walkthrough.
 */

import type { SpanBooking } from "@/lib/reports/booking-window"
import { cachedRead, forgetCached, keepCached, takeCached } from "@/lib/workspace/read-cache"

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

function forgetBookingReads(): void {
  forgetCached("/api/sections/bookings");
  forgetCached("/api/reservations/span");
  forgetCached("/api/sections/reports");
  forgetCached("/api/buchungen");
}

async function readJson<T>(path: string, accept: (data: T) => boolean): Promise<T | null> {
  return cachedRead(path, async () => {
    const data = await getJson<T>(path);
    if (!data || !accept(data)) return null;
    return data;
  });
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

export function peekBootstrap(): WorkspaceBootstrap | null {
  const data = takeCached<WorkspaceBootstrap>("/api/workspace");
  return data?.source === "live" ? data : null;
}

export async function fetchBootstrap(): Promise<WorkspaceBootstrap | null> {
  if (!isWorkspaceMode()) return null;
  return readJson<WorkspaceBootstrap>("/api/workspace", (data) => data.source === "live");
}

export async function fetchSectionBookings(
  section: "bookings",
  date?: string,
): Promise<BookingViewModel[] | null> {
  if (!isWorkspaceMode()) return null;
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  const data = await readJson<{ source: string; bookings: BookingViewModel[] }>(
    `/api/sections/${section}${query}`,
    (body) => body.source === "live" && Array.isArray(body.bookings),
  );
  return data?.bookings ?? null;
}

export async function fetchFamilies(): Promise<FamilyRow[] | null> {
  if (!isWorkspaceMode()) return null;
  const data = await readJson<{ source: string; families: FamilyRow[] }>(
    "/api/sections/families",
    (body) => body.source === "live" && Array.isArray(body.families),
  );
  return data?.families ?? null;
}

export async function fetchPackages(): Promise<PackageOption[] | null> {
  if (!isWorkspaceMode()) return null;
  const data = await readJson<{ source: string; packages: PackageOption[] }>(
    "/api/packages",
    (body) => body.source === "live" && Array.isArray(body.packages),
  );
  return data?.packages ?? null;
}

export async function cancelBooking(input: {
  reservationId: string;
  expectedVersion: number;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isWorkspaceMode()) return { ok: false, reason: "Die Buchung kann in der Demo nur ausgeblendet werden." };
  const result = await postJson<{ ok: true }>("/api/bookings/cancel", input);
  if (!result.ok) {
    if (result.error === "forbidden") return { ok: false, reason: "Dafür fehlt die Berechtigung." };
    if (result.error === "stale") return { ok: false, reason: "Die Buchung wurde inzwischen geändert." };
    return { ok: false, reason: "Die Buchung konnte nicht entfernt werden." };
  }
  forgetBookingReads();
  return { ok: true };
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
  forgetBookingReads();
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
  const data = await readJson<{
    source: string;
    report: {
      bookedValueMinor: number;
      currency: string;
      collectedPayments: { connected: boolean };
    };
  }>("/api/sections/reports", (body) => body.source === "live" && Boolean(body.report));
  return data?.report ?? null;
}

export type PosReport = {
  empty: boolean;
  locationId: string;
  siteName: string;
  sites: Array<{ locationId: string; name: string }>;
  view: "month" | "year";
  month: string | null;
  year: number | null;
  months: string[];
  years: number[];
  incomplete: boolean;
  throughDate: string | null;
  comparisonLabel: string;
  targetLabel: string | null;
  cards: {
    gross: PosMetric;
    payingChildren: PosMetric;
    grossPerChild: PosMetric;
    receipts: PosMetric;
  };
  gastroPerChild: number | null;
  chipsPerChild: number | null;
  parties: number;
  mix: Array<{ key: string; label: string; gross: number; quantity: number }>;
  categories: Array<{ category: string; groupKey: string; gross: number; quantity: number; parties: number }>;
  products: Array<{ name: string; category: string; gross: number; quantity: number }>;
  trend: Array<{ month: string; gross: number; quantity: number; previousGross: number | null; previousQuantity: number | null }>;
  days: Array<{
    date: string;
    gross: number | null;
    quantity: number | null;
    targetGross: number | null;
    targetQuantity: number | null;
    partial: boolean;
    future: boolean;
  }>;
};

type PosMetric = { value: number; delta: number | null; trend: number[] };

function posReportPath(input: { locationId?: string; month?: string; view: "month" | "year" }): string {
  const params = new URLSearchParams({ view: input.view });
  if (input.locationId) params.set("locationId", input.locationId);
  if (input.month) params.set("month", input.month);
  return `/api/pos/report?${params.toString()}`;
}

function lastPosKey(view: "month" | "year"): string {
  return view === "year" ? "pos:last:year" : "pos:last:month";
}

export function peekLastPosReport(view: "month" | "year"): PosReport | null {
  return takeCached<PosReport>(lastPosKey(view)) ?? null;
}

export function peekPosReport(input: {
  locationId?: string;
  month?: string;
  view: "month" | "year";
}): PosReport | null {
  return takeCached<PosReport>(posReportPath(input)) ?? null;
}

export function forgetPosReports(): void {
  forgetCached("/api/pos/report");
  forgetCached("pos:last:");
}

export async function syncPos(): Promise<
  { ok: true; data: { written: number; removed: number; from: string; to: string } } | { ok: false; error: string }
> {
  const result = await postJson<{ source: string; written: number; removed: number; from: string; to: string }>(
    "/api/pos/sync",
    {},
  );
  if (!result.ok || result.data.source !== "live") {
    return { ok: false, error: result.ok ? "generic" : result.error };
  }
  return {
    ok: true,
    data: {
      written: result.data.written,
      removed: result.data.removed,
      from: result.data.from,
      to: result.data.to,
    },
  };
}

export async function fetchPosReport(input: {
  locationId?: string;
  month?: string;
  view: "month" | "year";
  anchor?: boolean;
}): Promise<PosReport | null> {
  if (!isWorkspaceMode()) return null;
  const path = posReportPath(input);
  const report = await cachedRead(path, async () => {
    const data = await getJson<{ source: string; report: PosReport }>(path);
    if (!data || data.source !== "live" || !data.report) return null;
    return data.report;
  });
  if (report && input.anchor) keepCached(lastPosKey(input.view), report);
  return report;
}

function spanPath(from: string, to: string): string {
  return `/api/reservations/span?${new URLSearchParams({ from, to }).toString()}`;
}

export function peekReservationSpan(from: string, to: string): SpanBooking[] | null {
  return takeCached<SpanBooking[]>(spanPath(from, to)) ?? null;
}

export async function fetchReservationSpan(from: string, to: string): Promise<SpanBooking[] | null> {
  if (!isWorkspaceMode()) return null;
  return cachedRead(spanPath(from, to), async () => {
    const data = await getJson<{ source: string; reservations: SpanBooking[] }>(spanPath(from, to));
    if (!data || data.source !== "live" || !Array.isArray(data.reservations)) return null;
    return data.reservations;
  });
}

export async function fetchCampaignsLive(): Promise<{
  audienceCount: number;
  campaigns: Array<{ id: string; status: string; body: string }>;
} | null> {
  if (!isWorkspaceMode()) return null;
  const data = await readJson<{
    source: string;
    audience: unknown[];
    campaigns: Array<{ id: string; status: string; body: string }>;
  }>("/api/sections/campaigns", (body) => body.source === "live" && Array.isArray(body.audience) && Array.isArray(body.campaigns));
  if (!data) return null;
  return {
    audienceCount: data.audience.length,
    campaigns: data.campaigns,
  };
}

export async function fetchPortalNotices(): Promise<
  Array<{ id: string; title: string; body: string; status: string }> | null
> {
  if (!isWorkspaceMode()) return null;
  const data = await readJson<{
    source: string;
    notices: Array<{ id: string; title: string; body: string; status: string }>;
  }>("/api/sections/portal", (body) => body.source === "live" && Array.isArray(body.notices));
  if (!data) return null;
  return data.notices;
}

export type TeamShift = {
  id: string;
  displayName: string | null;
  localDate: string;
  startMinute: number;
  endMinute: number;
};

export type TeamLive = {
  source: "live";
  weekStartsOn: string;
  availabilityScope: "location" | "self" | "none";
  availability: Array<{
    displayName: string | null;
    windows: Array<{ weekday: number; startMinute: number; endMinute: number }>;
  }>;
  week: {
    published: {
      status: string;
      shifts: TeamShift[];
      warnings: Array<{ code: string; localDate?: string }>;
    } | null;
    draftCount: number;
  } | null;
  punches: Array<{
    id: string;
    displayName: string | null;
    kind: "in" | "out";
    localDate: string;
    localTime: string;
  }>;
};

export async function fetchTeamLive(): Promise<TeamLive | null> {
  if (!isWorkspaceMode()) return null;
  const data = await readJson<TeamLive & { source: string }>(
    "/api/sections/team",
    (body) => body.source === "live",
  );
  if (!data) return null;
  return data;
}

export type WebsiteRequestStatus = "angefragt" | "bearbeitet" | "angenommen" | "abgelehnt";

export type WebsiteBirthdayPayload = {
  buchung: "geburtstag";
  datum: string;
  zeitfenster: string;
  paket: "comfort" | "deluxe";
  kind_name: string;
  kind_alter: string;
  kinder: number;
  kleinkinder: number;
  erwachsene: number;
  erwachsenenZusatz: boolean;
  summeVorschau: number;
  vorname: string;
  nachname: string;
  anrede: string;
  adresse: string;
  plz: string;
  email: string;
  telefon: string;
  nachricht: string;
  quelle: string;
  datenschutz: string;
  website: string;
};

export type WebsiteKitaPayload = {
  buchung: "kita";
  wunschtermin: string;
  zeitfenster: string;
  kinder: number;
  paedagogen: number;
  begleitpersonen: number;
  summeVorschau: number;
  einrichtung: string;
  art: string;
  ansprechpartner: string;
  anrede: string;
  adresse: string;
  plz: string;
  email: string;
  telefon: string;
  nachricht: string;
  quelle: string;
  datenschutz: string;
  website: string;
};

export type WebsiteRequestRow = {
  id: string;
  kind: "geburtstag" | "kita";
  status: WebsiteRequestStatus;
  receivedAt: string;
  reservationId: string | null;
  reference: string | null;
  rejectionReason: string;
  payload: WebsiteBirthdayPayload | WebsiteKitaPayload | null;
};

export async function fetchWebsiteRequests(scope: "open" | "all"): Promise<WebsiteRequestRow[] | null> {
  if (!isWorkspaceMode()) return null;
  const data = await readJson<{ source: string; requests: WebsiteRequestRow[] }>(
    `/api/buchungen?scope=${scope}`,
    (body) => body.source === "live" && Array.isArray(body.requests),
  );
  if (!data) return null;
  return data.requests;
}

export async function decideWebsiteRequest(
  action: "bearbeitet" | "ablehnen" | "annehmen",
  id: string,
  reason?: string,
): Promise<
  | {
      ok: true;
      reference?: string;
      localDate?: string;
      localTime?: string;
      durationMinutes?: number;
    }
  | { ok: false; reason: string }
> {
  try {
    const response = await fetch(`/api/buchungen/${action}`, {
      method: "POST",
      credentials: "include",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ id, reason }),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      reason?: string;
      error?: string;
      reference?: string;
      localDate?: string;
      localTime?: string;
      durationMinutes?: number;
    };
    if (!response.ok || data.ok === false) {
      if (data.error === "forbidden") return { ok: false, reason: "Dafür fehlt die Berechtigung." };
      if (data.error === "unauthenticated") return { ok: false, reason: "Die Anmeldung ist abgelaufen." };
      return { ok: false, reason: data.reason ?? "Das hat nicht geklappt." };
    }
    forgetBookingReads();
    return {
      ok: true,
      reference: data.reference,
      localDate: data.localDate,
      localTime: data.localTime,
      durationMinutes: data.durationMinutes,
    };
  } catch {
    return { ok: false, reason: "Die Anfrage ist gerade nicht erreichbar." };
  }
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
