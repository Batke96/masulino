export type StaffPerson = {
  membershipId: string;
  name: string;
  email: string;
  roleKey: string;
  roleLabel: string;
  locationId: string | null;
  locationName: string | null;
  removable: boolean;
};

export type StaffRoleOption = {
  roleKey: string;
  label: string;
  needsLocation: boolean;
};

export type StaffLocation = {
  id: string;
  name: string;
};

export type StaffDirectory = {
  people: StaffPerson[];
  roles: StaffRoleOption[];
  locations: StaffLocation[];
};

export type IssuedAccess = {
  name: string;
  email: string;
  password: string;
  roleLabel: string;
};

type Failure = { ok: false; error: string; details: string };

async function readBody(response: Response): Promise<{ error?: string; details?: unknown }> {
  try {
    return (await response.json()) as { error?: string; details?: unknown };
  } catch {
    return {};
  }
}

function failure(body: { error?: string; details?: unknown }, fallback = "generic"): Failure {
  const details = typeof body.details === "string" ? body.details : fallback;
  return { ok: false, error: body.error ?? fallback, details };
}

export async function fetchStaffDirectory(): Promise<StaffDirectory | null> {
  try {
    const response = await fetch("/api/staff/users", {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as StaffDirectory;
  } catch {
    return null;
  }
}

export async function createStaffAccount(input: {
  name: string;
  email: string;
  roleKey: string;
  locationId: string | null;
  password: string;
}): Promise<{ ok: true; access: IssuedAccess } | Failure> {
  try {
    const response = await fetch("/api/staff/users", {
      method: "POST",
      credentials: "include",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await readBody(response);
    if (!response.ok) return failure(body);
    const created = body as IssuedAccess;
    if (!created.email || !created.password) return { ok: false, error: "generic", details: "generic" };
    return { ok: true, access: created };
  } catch {
    return { ok: false, error: "generic", details: "generic" };
  }
}

export async function removeStaffAccount(membershipId: string): Promise<{ ok: true } | Failure> {
  try {
    const response = await fetch("/api/staff/users/remove", {
      method: "POST",
      credentials: "include",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ membershipId }),
    });
    const body = await readBody(response);
    if (!response.ok) return failure(body);
    return { ok: true };
  } catch {
    return { ok: false, error: "generic", details: "generic" };
  }
}

export function staffAccountMessage(details: string): string {
  if (details === "grant_outside_authority" || details === "permission") {
    return "Diese Rolle liegt außerhalb deiner Berechtigung.";
  }
  if (details === "last_owner") return "Der letzte Inhaber kann nicht entfernt werden.";
  if (details === "location_required") return "Für diese Rolle ist ein Standort nötig.";
  if (details === "location_not_allowed") return "Diese Rolle gilt für den ganzen Betrieb, ohne Standort.";
  if (details === "already_member" || details === "email_taken") return "Diese E-Mail ist schon vergeben.";
  if (details === "password_length" || details === "invalid_staff_account") {
    return "Das Passwort braucht mindestens 12 Zeichen. Prüfe auch Name, E-Mail und Rolle.";
  }
  if (details === "location") return "Dieser Standort ist nicht verfügbar.";
  if (details === "mfa") return "Für diese Rolle fehlt der zweite Faktor.";
  return "Das hat nicht geklappt. Bitte erneut versuchen.";
}
