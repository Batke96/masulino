import type { StaffCapabilities } from "./capabilities";

export type StaffSession =
  | { authenticated: false }
  | {
      authenticated: true;
      source?: "session" | "dev";
      access: "none" | "active";
      user: { name: string; email: string };
      roleKey: string;
      roleLabel: string;
      tenantName: string;
      locationName: string | null;
      localDate: string | null;
      capabilities?: StaffCapabilities;
    };

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchStaffSession(): Promise<StaffSession> {
  try {
    const response = await fetch("/api/session", {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    const data = await readJson<StaffSession>(response);
    if (data && "authenticated" in data && data.authenticated) return data;
    return { authenticated: false };
  } catch {
    return { authenticated: false };
  }
}

export async function signInStaff(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; offline?: boolean }> {
  try {
    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      credentials: "include",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) return { ok: false };
    return { ok: true };
  } catch {
    return { ok: false, offline: true };
  }
}

export async function signOutStaff(): Promise<void> {
  await fetch("/api/auth/sign-out", {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: "{}",
  }).catch(() => undefined);
}

export function formatStaffDate(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  if (!year || !month || !day) return localDate;
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(year, month - 1, day, 12)))
    .toLocaleUpperCase("de-DE");
}
