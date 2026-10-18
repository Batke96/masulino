export type ItMember = {
  id: string;
  displayName: string;
  email: string;
  status: "active" | "suspended" | "revoked";
  grants: Array<{ roleKey: string; locationId: string | null; locationName: string | null }>;
};

export type ItInvitation = {
  id: string;
  email: string;
  roleKey: string;
  locationId: string | null;
  locationName: string | null;
  expiresAt: string;
};

export type ItDirectory = {
  members: ItMember[];
  invitations: ItInvitation[];
  roles: string[];
  locations: Array<{ id: string; name: string }>;
};

export type ItReport = {
  locationId: string;
  fromDate: string;
  toDate: string;
  countsByDay: Array<{ localDate: string; count: number }>;
  upcoming: Array<{
    id: string;
    reference: string;
    status: string;
    localDate: string;
    localTime: string;
    organizerName: string;
    packageName: string;
  }>;
  activityDenied: boolean;
  bookedValue: {
    bookedValueMinor: number;
    currency: string;
    collectedPayments: { connected: boolean; amountMinor?: number; currency?: string };
  } | null;
};

export type ItPackage = {
  id: string;
  name: string;
  publicCode: string | null;
  priceMinor: number;
  currency: string;
  durationMinutes: number;
  status: "active" | "inactive";
};

export type ItResource = {
  id: string;
  name: string;
  capacityChildren: number;
  status: "active" | "inactive";
};

export type ItCombination = {
  id: string;
  name: string;
  minChildren: number;
  maxChildren: number;
  maxAdults: number;
  status: "active" | "inactive";
  resourceIds: string[];
};

export type ItClosure = {
  id: string;
  startsOn: string;
  endsOn: string;
  reason: string;
};

export type ItReservation = {
  id: string;
  reference: string;
  status: string;
  localDate: string;
  localTime: string;
  organizerName: string;
  organizerPhone: string;
  notes: string;
  version: number;
  packageName: string;
};

export type ItRecords = {
  locationId: string;
  locationName: string;
  packages: ItPackage[];
  resources: ItResource[];
  combinations: ItCombination[];
  closures: ItClosure[];
  venue: { publicSlug: string; status: string } | null;
  reservations: ItReservation[];
  reservationsDenied: boolean;
};

export type ApiFailure = { ok: false; error: string; details?: unknown };
export type ApiSuccess<T> = { ok: true; data: T };

async function request<T>(path: string, init?: RequestInit): Promise<ApiSuccess<T> | ApiFailure> {
  try {
    const response = await fetch(path, {
      credentials: "include",
      headers: {
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
      ...init,
    });
    const data = (await response.json()) as T & { error?: string; details?: unknown };
    if (!response.ok) return { ok: false, error: data.error ?? "generic", details: data.details };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "offline" };
  }
}

function post<T>(path: string, body: unknown) {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function fetchItDirectory() {
  return request<ItDirectory>("/api/it/directory");
}

export function inviteItStaff(body: { email: string; roleKey: string; locationId: string | null }) {
  return post<{ acceptPath: string; email: string; roleKey: string }>("/api/invitations", body);
}

export function suspendItMembership(membershipId: string) {
  return post<{ ok: true }>("/api/it/memberships/suspend", { membershipId });
}

export function restoreItMembership(membershipId: string) {
  return post<{ ok: true }>("/api/it/memberships/restore", { membershipId });
}

export function fetchItReport(locationId: string, from?: string, to?: string) {
  const query = new URLSearchParams({ locationId });
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  return request<ItReport>(`/api/it/report?${query.toString()}`);
}

export function fetchItRecords(locationId?: string) {
  const query = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
  return request<ItRecords>(`/api/it/records${query}`);
}

export function saveItPackage(body: {
  locationId: string;
  packageId: string;
  publicCode: string | null;
  priceMinor: number;
  durationMinutes: number;
  status: "active" | "inactive";
}) {
  return post<{ ok: true }>("/api/it/packages", body);
}

export function saveItResource(body: {
  locationId: string;
  resourceId: string;
  name: string;
  capacityChildren: number;
  status: "active" | "inactive";
}) {
  return post<{ ok: true }>("/api/it/resources", body);
}

export function saveItCombination(body: {
  locationId: string;
  combinationId: string;
  name: string;
  minChildren: number;
  maxChildren: number;
  maxAdults: number;
  status: "active" | "inactive";
  resourceIds: string[];
}) {
  return post<{ ok: true }>("/api/it/combinations", body);
}

export function addItClosure(body: { locationId: string; startsOn: string; endsOn: string; reason: string }) {
  return post<{ id: string }>("/api/it/closures", body);
}

export function saveItVenue(body: { locationId: string; publicSlug: string }) {
  return post<{ ok: true }>("/api/it/venue", body);
}

export function saveReservationContact(body: {
  reservationId: string;
  expectedVersion: number;
  organizerPhone: string;
  notes: string;
}) {
  return post<{ version: number }>("/api/bookings/contact", body);
}

export function cancelItReservation(body: { reservationId: string; expectedVersion: number }) {
  return post<{ ok: true }>("/api/bookings/cancel", body);
}

export function rescheduleItReservation(body: {
  reservationId: string;
  expectedVersion: number;
  localDate: string;
  localTime: string;
}) {
  return post<{ version: number }>("/api/bookings/reschedule", body);
}

export function describeItFailure(error: string, details?: unknown): string {
  const detail = typeof details === "string" ? details : "";
  if (error === "offline") return "Die API ist nicht erreichbar.";
  if (error === "forbidden" || detail === "permission" || detail === "mfa") return "Kein Zugriff.";
  if (error === "last_owner" || detail === "last_owner") return "Der letzte aktive Inhaber kann nicht entfernt werden.";
  if (detail === "grant_outside_authority") return "Diese Rolle kann nicht vergeben werden.";
  if (detail === "location_required") return "Für diese Rolle ist ein Standort erforderlich.";
  if (detail === "location_not_allowed") return "Diese Rolle gilt für den ganzen Betrieb, ohne Standort.";
  if (detail === "public_code") return "Dieser öffentliche Code ist schon vergeben.";
  if (detail === "public_slug") return "Dieser Slug ist schon vergeben.";
  if (error === "stale") return "Jemand hat den Datensatz inzwischen gespeichert. Die Liste wird neu geladen.";
  if (error === "conflict") return "Das lässt sich so nicht speichern.";
  if (error === "validation") return "Bitte die Angaben prüfen.";
  return "Das hat nicht geklappt.";
}
