"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { StaffCapabilities } from "@/lib/workspace/capabilities";
import { enableWorkspace } from "@/lib/workspace/client";
import {
  enableStaffTotp,
  fetchStaffSession,
  formatStaffDate,
  signInStaff,
  signOutStaff,
  verifyStaffBackupCode,
  verifyStaffTotp,
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
  it: false,
};

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function toIdentity(session: Extract<StaffSession, { access: "active" }>, signOut: () => void): StaffIdentity {
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

type Gate = "checking" | "login" | "denied" | "mfa_enroll" | "mfa_challenge" | "app";

function totpSecret(uri: string): string {
  try {
    return new URL(uri).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

export function StaffAccess({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<Gate>(wantsWorkspace() ? "checking" : "app");
  const [identity, setIdentity] = useState<StaffIdentity | null>(null);
  const [error, setError] = useState<"none" | "invalid" | "offline" | "code">("none");
  const [pending, setPending] = useState(false);
  const [totpUri, setTotpUri] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

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
    if (session.access === "mfa_enroll") {
      setIdentity(null);
      setAccess("mfa_enroll");
      return;
    }
    if (session.access !== "active") {
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
            <p>Zugang nur für eingerichtete Konten. Es gibt kein öffentliches Konto.</p>
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
                if (result.twoFactorRedirect) {
                  setAccess("mfa_challenge");
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
              <p>Jede Rolle meldet sich mit E-Mail und Passwort an.</p>
              <p>it.masulino@example.test · Synthetic-Staff-1</p>
              <p>owner.masulino@example.test · Synthetic-Staff-1</p>
              <p>reception.masulino@example.test · Synthetic-Staff-1</p>
              <p>employee.masulino@example.test · Synthetic-Staff-1</p>
              <p>manager.masulino@example.test · Synthetic-Staff-1</p>
              <p>user@example.test · password</p>
            </details>
          </>
        ) : null}
        {access === "mfa_challenge" ? (
          <MfaCodeForm
            title="Zweiter Faktor."
            lead="Gib den Code aus deiner Authenticator-App ein. Ein Wiederherstellungscode gilt einmal."
            pending={pending}
            error={error === "code"}
            onTotp={async (code) => {
              setPending(true);
              setError("none");
              const result = await verifyStaffTotp(code);
              setPending(false);
              if (!result.ok) {
                setError("code");
                return;
              }
              await applySession(await fetchStaffSession());
            }}
            onBackup={async (code) => {
              setPending(true);
              setError("none");
              const result = await verifyStaffBackupCode(code);
              setPending(false);
              if (!result.ok) {
                setError("code");
                return;
              }
              await applySession(await fetchStaffSession());
            }}
            onCancel={signOut}
          />
        ) : null}
        {access === "mfa_enroll" ? (
          <MfaEnroll
            pending={pending}
            error={error}
            totpUri={totpUri}
            backupCodes={backupCodes}
            onEnable={async (password) => {
              setPending(true);
              setError("none");
              const result = await enableStaffTotp(password);
              setPending(false);
              if (!result.ok) {
                setError("invalid");
                return;
              }
              setTotpUri(result.totpURI);
              setBackupCodes(result.backupCodes);
            }}
            onVerify={async (code) => {
              setPending(true);
              setError("none");
              const result = await verifyStaffTotp(code);
              setPending(false);
              if (!result.ok) {
                setError("code");
                return;
              }
              setBackupCodes([]);
              setTotpUri("");
              await applySession(await fetchStaffSession());
            }}
            onCancel={signOut}
          />
        ) : null}
      </section>
    </main>
  );
}

function MfaCodeForm({
  title,
  lead,
  pending,
  error,
  onTotp,
  onBackup,
  onCancel,
}: {
  title: string;
  lead: string;
  pending: boolean;
  error: boolean;
  onTotp: (code: string) => Promise<void>;
  onBackup: (code: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [backup, setBackup] = useState(false);
  return (
    <>
      <h1>{title}</h1>
      <p>{lead}</p>
      {error ? <p className="staff-gate-error">Der Code ist ungültig oder abgelaufen.</p> : null}
      <form
        className="staff-gate-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const code = String(data.get("code") ?? "").trim();
          if (!code) return;
          if (backup) await onBackup(code);
          else await onTotp(code);
        }}
      >
        <label className="field-label">
          {backup ? "Wiederherstellungscode" : "Code"}
          <input name="code" inputMode={backup ? "text" : "numeric"} autoComplete="one-time-code" required />
        </label>
        <button className="button dark full-width" type="submit" disabled={pending}>
          {pending ? "Wird geprüft …" : "Bestätigen"}
        </button>
      </form>
      <button className="text-button" type="button" onClick={() => setBackup((value) => !value)}>
        {backup ? "Authenticator-Code verwenden" : "Wiederherstellungscode verwenden"}
      </button>
      <button className="button soft" type="button" onClick={onCancel}>Abmelden</button>
    </>
  );
}

function MfaEnroll({
  pending,
  error,
  totpUri,
  backupCodes,
  onEnable,
  onVerify,
  onCancel,
}: {
  pending: boolean;
  error: "none" | "invalid" | "offline" | "code";
  totpUri: string;
  backupCodes: string[];
  onEnable: (password: string) => Promise<void>;
  onVerify: (code: string) => Promise<void>;
  onCancel: () => void;
}) {
  const secret = totpSecret(totpUri);
  return (
    <>
      <h1>Zwei-Faktor einrichten.</h1>
      <p>Für Inhaber, Verwaltung, IT und Standortleitung ist ein zweiter Faktor erforderlich, bevor der Betrieb zugänglich ist.</p>
      {error === "invalid" ? <p className="staff-gate-error">Das Passwort stimmt nicht.</p> : null}
      {error === "code" ? <p className="staff-gate-error">Der Code ist ungültig. Prüfe die Uhrzeit des Geräts.</p> : null}
      {secret ? (
        <>
          <p>Trag dieses Geheimnis in eine Authenticator-App ein. Es wird nur hier angezeigt.</p>
          <p className="staff-gate-secret">{secret}</p>
          <p>Speichere die Wiederherstellungscodes jetzt. Jeder Code gilt einmal. Es gibt keinen anderen Wiederherstellungsweg.</p>
          <pre className="staff-gate-codes">{backupCodes.join("\n")}</pre>
          <form
            className="staff-gate-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              await onVerify(String(data.get("code") ?? "").trim());
            }}
          >
            <label className="field-label">Code aus der App<input name="code" inputMode="numeric" autoComplete="one-time-code" required /></label>
            <button className="button dark full-width" type="submit" disabled={pending}>Bestätigen</button>
          </form>
        </>
      ) : (
        <form
          className="staff-gate-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            await onEnable(String(data.get("password") ?? ""));
          }}
        >
          <label className="field-label">Passwort zur Bestätigung<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="button dark full-width" type="submit" disabled={pending}>Geheimnis erzeugen</button>
        </form>
      )}
      <button className="button soft" type="button" onClick={onCancel}>Abmelden</button>
    </>
  );
}
