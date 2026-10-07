"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { StaffCapabilities } from "@/lib/workspace/capabilities";
import { enableWorkspace } from "@/lib/workspace/client";
import {
  fetchStaffSession,
  formatStaffDate,
  signInStaff,
  signOutStaff,
  type StaffSession,
} from "@/lib/workspace/session";

export type StaffIdentity = {
  name: string;
  firstName: string;
  email: string;
  roleLabel: string;
  tenantName: string;
  locationName: string;
  dateLabel: string;
  capabilities: StaffCapabilities;
  signOut: () => void;
};

const StaffIdentityContext = createContext<StaffIdentity | null>(null);

export function useStaffIdentity(): StaffIdentity | null {
  return useContext(StaffIdentityContext);
}

function wantsWorkspace(): boolean {
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  return env.VITE_MASULINO_FIXTURES !== "1";
}

const noCapabilities: StaffCapabilities = {
  bookings: false,
  createBooking: false,
  families: false,
  team: false,
  reports: false,
  campaigns: false,
  portal: false,
  agents: false,
};

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function toIdentity(session: Extract<StaffSession, { authenticated: true }>, signOut: () => void): StaffIdentity {
  return {
    name: session.user.name,
    firstName: firstName(session.user.name),
    email: session.user.email,
    roleLabel: session.roleLabel,
    tenantName: session.tenantName,
    locationName: session.locationName ?? session.tenantName,
    dateLabel: session.localDate ? formatStaffDate(session.localDate) : "",
    capabilities: session.capabilities ?? noCapabilities,
    signOut,
  };
}

export function StaffAccess({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<"checking" | "login" | "denied" | "app">(
    wantsWorkspace() ? "checking" : "app",
  );
  const [identity, setIdentity] = useState<StaffIdentity | null>(null);
  const [error, setError] = useState<"none" | "invalid" | "offline">("none");
  const [pending, setPending] = useState(false);

  function signOut() {
    void signOutStaff().then(() => {
      setIdentity(null);
      setAccess("login");
    });
  }

  async function applySession(session: StaffSession) {
    if (!session.authenticated || session.source === "dev") {
      setIdentity(null);
      setAccess("login");
      return;
    }
    if (session.access === "none") {
      setAccess("denied");
      return;
    }
    setIdentity(toIdentity(session, signOut));
    setAccess("app");
  }

  useEffect(() => {
    if (!wantsWorkspace()) return;
    let cancelled = false;
    void fetchStaffSession().then((session) => {
      if (!cancelled) void applySession(session);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (access === "app") {
    if (identity) enableWorkspace();
    return <StaffIdentityContext.Provider value={identity}>{children}</StaffIdentityContext.Provider>;
  }

  return (
    <main className="staff-gate">
      <section className="surface staff-gate-card">
        <p className="eyebrow">MASULINO</p>
        {access === "checking" ? <h1>Anmeldung wird geprüft.</h1> : null}
        {access === "denied" ? (
          <>
            <h1>Kein Zugriff.</h1>
            <p>Für dieses Konto ist kein aktiver Betrieb freigeschaltet.</p>
            <button className="button soft" type="button" onClick={signOut}>Abmelden</button>
          </>
        ) : null}
        {access === "login" ? (
          <>
            <h1>Anmeldung.</h1>
            <p>Zugang nur mit Einladung. Es gibt kein öffentliches Konto.</p>
            {error === "invalid" ? <p className="staff-gate-error">Anmeldung fehlgeschlagen. Bitte Angaben prüfen.</p> : null}
            {error === "offline" ? <p className="staff-gate-error">Der Anmeldedienst ist nicht erreichbar. Postgres und die API müssen laufen.</p> : null}
            <form
              className="staff-gate-form"
              onSubmit={async (event) => {
                event.preventDefault();
                setPending(true);
                setError("none");
                const data = new FormData(event.currentTarget);
                const result = await signInStaff(
                  String(data.get("email") ?? ""),
                  String(data.get("password") ?? ""),
                );
                setPending(false);
                if (!result.ok) {
                  setError(result.offline ? "offline" : "invalid");
                  return;
                }
                await applySession(await fetchStaffSession());
              }}
            >
              <label className="field-label">E-Mail<input name="email" type="email" autoComplete="username" required /></label>
              <label className="field-label">Passwort<input name="password" type="password" autoComplete="current-password" required /></label>
              <button className="button dark full-width" type="submit" disabled={pending}>
                {pending ? "Wird geprüft …" : "Anmelden"}
              </button>
            </form>
            <details className="staff-gate-hint">
              <summary>Lokale Testzugänge</summary>
              <p>user@example.test · Passwort password · Inhaber mit allen Rechten</p>
              <p>Übrige Konten: Synthetic-Staff-1</p>
              <p>reception.masulino@example.test · Empfang, Buchungen</p>
              <p>employee.masulino@example.test · Team, ohne Buchungsliste</p>
              <p>manager.masulino@example.test · Standortleitung</p>
              <p>owner.masulino@example.test · Inhaber</p>
            </details>
          </>
        ) : null}
      </section>
    </main>
  );
}
