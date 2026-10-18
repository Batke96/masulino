"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  addItClosure,
  cancelItReservation,
  describeItFailure,
  fetchItDirectory,
  fetchItRecords,
  fetchItReport,
  inviteItStaff,
  rescheduleItReservation,
  restoreItMembership,
  saveItCombination,
  saveItPackage,
  saveItResource,
  saveItVenue,
  saveReservationContact,
  suspendItMembership,
  type ApiFailure,
  type ItCombination,
  type ItDirectory,
  type ItPackage,
  type ItRecords,
  type ItReport,
  type ItReservation,
  type ItResource,
} from "@/lib/workspace/it-client";
import { ItUsers } from "@/app/it-users";

const roleLabel: Record<string, string> = {
  tenant_owner: "Inhaber",
  tenant_administrator: "Verwaltung",
  it: "IT",
  location_manager: "Standortleitung",
  shift_lead: "Schichtleitung",
  reception: "Empfang",
  employee: "Team",
};

const tenantWideRoles = new Set(["tenant_owner", "tenant_administrator", "it"]);

const statusLabel: Record<string, string> = {
  active: "Aktiv",
  suspended: "Gesperrt",
  revoked: "Entzogen",
  confirmed: "Bestätigt",
  requested: "Angefragt",
  cancelled: "Storniert",
  completed: "Abgeschlossen",
  draft: "Entwurf",
  no_show: "Nicht erschienen",
  published: "Veröffentlicht",
  unpublished: "Nicht veröffentlicht",
  inactive: "Inaktiv",
};

function fail(result: ApiFailure): void {
  toast(describeItFailure(result.error, result.details));
}

function euro(minor: number, currency: string): string {
  return (minor / 100).toLocaleString("de-DE", { style: "currency", currency: currency || "EUR" });
}

function dateLabel(value: string): string {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

export function ItWorkspace() {
  const [tab, setTab] = useState<"users" | "reports" | "records">("users");
  const [directory, setDirectory] = useState<ItDirectory | null>(null);
  const [records, setRecords] = useState<ItRecords | null>(null);
  const [report, setReport] = useState<ItReport | null>(null);
  const [locationId, setLocationId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState("reception");
  const [inviteLocation, setInviteLocation] = useState("");
  const [acceptPath, setAcceptPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [packages, setPackages] = useState<ItPackage[]>([]);
  const [resources, setResources] = useState<ItResource[]>([]);
  const [combinations, setCombinations] = useState<ItCombination[]>([]);
  const [closure, setClosure] = useState({ startsOn: "", endsOn: "", reason: "" });
  const [slug, setSlug] = useState("");
  const [reservationId, setReservationId] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [moveDate, setMoveDate] = useState("");
  const [moveTime, setMoveTime] = useState("14:00");
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function loadDirectory() {
    const result = await fetchItDirectory();
    if (!result.ok) {
      fail(result);
      return;
    }
    setDirectory(result.data);
    setRoleKey((current) => (result.data.roles.includes(current) ? current : result.data.roles[0] ?? ""));
    setInviteLocation((current) => current || result.data.locations[0]?.id || "");
    setLocationId((current) => current || result.data.locations[0]?.id || "");
  }

  async function loadRecords(nextLocation = locationId) {
    const result = await fetchItRecords(nextLocation || undefined);
    if (!result.ok) {
      fail(result);
      setRecords(null);
      return;
    }
    setRecords(result.data);
    setLocationId(result.data.locationId);
    setPackages(result.data.packages);
    setResources(result.data.resources);
    setCombinations(result.data.combinations);
    setSlug(result.data.venue?.publicSlug ?? "");
    setClosure((current) => ({
      startsOn: current.startsOn || result.data.reservations[0]?.localDate || "",
      endsOn: current.endsOn || result.data.reservations[0]?.localDate || "",
      reason: current.reason,
    }));
    const selected = result.data.reservations.find((item) => item.id === reservationId) ?? result.data.reservations[0];
    if (selected) {
      setReservationId(selected.id);
      setPhone(selected.organizerPhone);
      setNotes(selected.notes);
      setMoveDate(selected.localDate);
      setMoveTime(selected.localTime);
    }
  }

  async function loadReport(nextLocation = locationId, from = fromDate, to = toDate) {
    if (!nextLocation) return;
    const result = await fetchItReport(nextLocation, from, to);
    if (!result.ok) {
      fail(result);
      return;
    }
    setReport(result.data);
    setFromDate(result.data.fromDate);
    setToDate(result.data.toDate);
  }

  useEffect(() => {
    void loadDirectory();
  }, []);

  useEffect(() => {
    if (!locationId) return;
    void loadRecords(locationId);
    void loadReport(locationId);
  }, [locationId]);

  const selectedReservation: ItReservation | undefined = records?.reservations.find((item) => item.id === reservationId);
  const locationName = directory?.locations.find((item) => item.id === locationId)?.name ?? records?.locationName ?? "";

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !roleKey || busy) return;
    setBusy(true);
    const result = await inviteItStaff({
      email: email.trim(),
      roleKey,
      locationId: tenantWideRoles.has(roleKey) ? null : inviteLocation,
    });
    setBusy(false);
    if (!result.ok) {
      fail(result);
      return;
    }
    setAcceptPath(result.data.acceptPath);
    setEmail("");
    toast("Einladung gespeichert. Es wurde keine E-Mail gesendet.");
    await loadDirectory();
  }

  async function changeMembership(id: string, mode: "suspend" | "restore") {
    setBusy(true);
    const result = mode === "suspend" ? await suspendItMembership(id) : await restoreItMembership(id);
    setBusy(false);
    if (!result.ok) {
      fail(result);
      return;
    }
    toast(mode === "suspend" ? "Mitgliedschaft gesperrt." : "Mitgliedschaft wieder aktiv.");
    await loadDirectory();
  }

  return (
    <div className="it-workspace">
      <div className="content-toolbar" role="tablist" aria-label="IT">
        <button className={tab === "users" ? "button dark" : "button soft"} type="button" onClick={() => setTab("users")}>Benutzer</button>
        <button className={tab === "reports" ? "button dark" : "button soft"} type="button" onClick={() => setTab("reports")}>Auswertungen</button>
        <button className={tab === "records" ? "button dark" : "button soft"} type="button" onClick={() => setTab("records")}>Stammdaten</button>
      </div>

      {tab === "users" ? (
        <>
          <ItUsers embedded />
          <section className="surface">
            <div className="section-head"><h2>Einladen</h2></div>
            <p className="fine-print">Die Einladung bleibt in diesem Betrieb. Es wird keine E-Mail gesendet. Der Annahmelink erscheint nur einmal.</p>
            <form className="it-form" onSubmit={invite}>
              <label className="field-label">E-Mail
                <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
              </label>
              <label className="field-label">Rolle
                <select aria-label="Rolle" value={roleKey} onChange={(event) => setRoleKey(event.target.value)}>
                  {(directory?.roles ?? []).map((role) => (
                    <option key={role} value={role}>{roleLabel[role] ?? role}</option>
                  ))}
                </select>
              </label>
              {tenantWideRoles.has(roleKey) ? null : (
                <label className="field-label">Standort
                  <select aria-label="Standort" value={inviteLocation} onChange={(event) => setInviteLocation(event.target.value)} required>
                    {(directory?.locations ?? []).map((location) => (
                      <option key={location.id} value={location.id}>{location.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <button className="button dark" type="submit" disabled={busy || !roleKey}>Einladen</button>
            </form>
            {acceptPath ? (
              <div className="callout blue">
                <div>
                  <strong>Annahmelink</strong>
                  <p className="it-link">{acceptPath}</p>
                  <p>Nur diese Anzeige enthält den Link. Nach dem Neuladen ist er nicht mehr sichtbar.</p>
                </div>
              </div>
            ) : null}
          </section>

          <section className="surface">
            <div className="section-head"><h2>Offene Einladungen</h2></div>
            {directory && directory.invitations.length === 0 ? <p>Keine offene Einladung.</p> : null}
            {directory && directory.invitations.length > 0 ? (
              <table className="it-table">
                <thead><tr><th>E-Mail</th><th>Rolle</th><th>Standort</th><th>Gültig bis</th></tr></thead>
                <tbody>
                  {directory.invitations.map((invitation) => (
                    <tr key={invitation.id}>
                      <td>{invitation.email}</td>
                      <td>{roleLabel[invitation.roleKey] ?? invitation.roleKey}</td>
                      <td>{invitation.locationName ?? "Gesamter Betrieb"}</td>
                      <td>{new Date(invitation.expiresAt).toLocaleString("de-DE")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {!directory ? <p>Benutzer werden geladen.</p> : null}
          </section>

          <section className="surface">
            <div className="section-head"><h2>Mitgliedschaften</h2></div>
            {directory ? (
              <table className="it-table">
                <thead><tr><th>Name</th><th>E-Mail</th><th>Rollen</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {directory.members.map((member) => (
                    <tr key={member.id}>
                      <td>{member.displayName}</td>
                      <td>{member.email}</td>
                      <td>{member.grants.map((grant) => `${roleLabel[grant.roleKey] ?? grant.roleKey}${grant.locationName ? ` · ${grant.locationName}` : ""}`).join(", ") || "Keine Rolle"}</td>
                      <td>{statusLabel[member.status] ?? member.status}</td>
                      <td>
                        {member.status === "active" ? (
                          <button className="button soft" type="button" disabled={busy} onClick={() => void changeMembership(member.id, "suspend")}>Sperren</button>
                        ) : null}
                        {member.status === "suspended" ? (
                          <button className="button soft" type="button" disabled={busy} onClick={() => void changeMembership(member.id, "restore")}>Wiederherstellen</button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p>Benutzer werden geladen.</p>}
          </section>
        </>
      ) : null}

      {tab === "reports" ? (
        <section className="surface">
          <div className="section-head"><h2>Auswertungen</h2></div>
          <form
            className="it-form"
            onSubmit={(event) => {
              event.preventDefault();
              void loadReport(locationId, fromDate, toDate);
            }}
          >
            <label className="field-label">Standort
              <select aria-label="Auswertung Standort" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                {(directory?.locations ?? []).map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </label>
            <label className="field-label">Von
              <input type="date" required value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            </label>
            <label className="field-label">Bis
              <input type="date" required value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </label>
            <button className="button dark" type="submit">Anzeigen</button>
          </form>
          {report ? (
            <>
              <div className="stats-row">
                <div className="stat">
                  <div className="stat-label">Gebuchter Wert</div>
                  <div className="stat-value">{report.bookedValue ? euro(report.bookedValue.bookedValueMinor, report.bookedValue.currency) : "—"}</div>
                  <div className="stat-note">
                    {report.bookedValue
                      ? "Nur bestätigte Buchungen in diesem Zeitraum. Keine Zahlung und kein Lohn."
                      : "Für diese Rolle nicht freigegeben."}
                  </div>
                </div>
              </div>
              {report.bookedValue?.collectedPayments.connected ? (
                <p>Erfasste Zahlungen: {euro(report.bookedValue.collectedPayments.amountMinor ?? 0, report.bookedValue.collectedPayments.currency ?? report.bookedValue.currency)}</p>
              ) : report.bookedValue ? (
                <div className="callout blue"><div><strong>Kein Zahlungsanschluss</strong><p>Es wird kein Zahlungsbetrag angezeigt. Der gebuchte Wert ist keine eingegangene Zahlung.</p></div></div>
              ) : null}
              <h3>Anzahl je Tag</h3>
              {report.activityDenied ? <p>Die Reservierungsliste ist für diese Rolle nicht freigegeben.</p> : null}
              {report.countsByDay.length === 0 && !report.activityDenied ? <p>Keine Reservierung in diesem Zeitraum.</p> : null}
              {report.countsByDay.length > 0 ? (
                <table className="it-table">
                  <thead><tr><th>Tag</th><th>Anzahl</th></tr></thead>
                  <tbody>
                    {report.countsByDay.map((day) => (
                      <tr key={day.localDate}><td>{dateLabel(day.localDate)}</td><td>{day.count}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <h3>Bevorstehende Reservierungen</h3>
              <p className="fine-print">Ab heute am Standort, innerhalb des gewählten Zeitraums. Stornierte Besuche zählen hier nicht.</p>
              {report.upcoming.length === 0 && !report.activityDenied ? <p>Keine bevorstehende Reservierung.</p> : null}
              {report.upcoming.length > 0 ? (
                <table className="it-table">
                  <thead><tr><th>Datum</th><th>Zeit</th><th>Name</th><th>Paket</th><th>Status</th><th>Referenz</th></tr></thead>
                  <tbody>
                    {report.upcoming.map((row) => (
                      <tr key={row.id}>
                        <td>{dateLabel(row.localDate)}</td>
                        <td>{row.localTime}</td>
                        <td>{row.organizerName}</td>
                        <td>{row.packageName}</td>
                        <td>{statusLabel[row.status] ?? row.status}</td>
                        <td>{row.reference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </>
          ) : <p>Die Auswertung wird geladen.</p>}
        </section>
      ) : null}

      {tab === "records" ? (
        <>
          <section className="surface">
            <div className="section-head"><h2>Stammdaten {locationName ? `· ${locationName}` : ""}</h2></div>
            <label className="field-label">Standort
              <select aria-label="Stammdaten Standort" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                {(directory?.locations ?? []).map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </label>
            <p className="fine-print">Fester Katalog. Audit, Einwilligungen, Zeitbuchungen, Club-Punkte, Zahlungsdaten und Zugangsgeheimnisse werden hier nicht geändert. Es gibt kein Löschen beliebiger Zeilen.</p>
          </section>

          <section className="surface">
            <div className="section-head"><h2>Pakete</h2></div>
            <p className="fine-print">Preis in ganzen Cent. Comfort und Deluxe tragen die öffentlichen Codes comfort und deluxe.</p>
            {packages.map((item, index) => (
              <form
                className="it-form"
                key={item.id}
                onSubmit={async (event) => {
                  event.preventDefault();
                  setBusy(true);
                  const result = await saveItPackage({
                    locationId,
                    packageId: item.id,
                    publicCode: item.publicCode,
                    priceMinor: item.priceMinor,
                    durationMinutes: item.durationMinutes,
                    status: item.status,
                  });
                  setBusy(false);
                  if (!result.ok) {
                    fail(result);
                    return;
                  }
                  toast(`${item.name} gespeichert.`);
                  await loadRecords(locationId);
                }}
              >
                <strong>{item.name}</strong>
                <label className="field-label">Öffentlicher Code
                  <input
                    aria-label={`Öffentlicher Code ${item.name}`}
                    value={item.publicCode ?? ""}
                    onChange={(event) => setPackages((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, publicCode: event.target.value || null } : row))}
                  />
                </label>
                <label className="field-label">Preis in Cent
                  <input
                    aria-label={`Preis ${item.name} in Cent`}
                    inputMode="numeric"
                    value={String(item.priceMinor)}
                    onChange={(event) => setPackages((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, priceMinor: Number(event.target.value.replace(/\D/g, "") || "0") } : row))}
                  />
                </label>
                <label className="field-label">Dauer in Minuten
                  <input
                    aria-label={`Dauer ${item.name}`}
                    inputMode="numeric"
                    value={String(item.durationMinutes)}
                    onChange={(event) => setPackages((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, durationMinutes: Number(event.target.value.replace(/\D/g, "") || "0") } : row))}
                  />
                </label>
                <label className="field-label">Aktiv
                  <input
                    type="checkbox"
                    aria-label={`${item.name} aktiv`}
                    checked={item.status === "active"}
                    onChange={(event) => setPackages((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, status: event.target.checked ? "active" : "inactive" } : row))}
                  />
                </label>
                <span className="fine-print">{euro(item.priceMinor, item.currency)}</span>
                <button className="button dark" type="submit" disabled={busy}>Speichern</button>
              </form>
            ))}
          </section>

          <section className="surface">
            <div className="section-head"><h2>Ressourcen</h2></div>
            {resources.map((item, index) => (
              <form
                className="it-form"
                key={item.id}
                onSubmit={async (event) => {
                  event.preventDefault();
                  setBusy(true);
                  const result = await saveItResource({
                    locationId,
                    resourceId: item.id,
                    name: item.name,
                    capacityChildren: item.capacityChildren,
                    status: item.status,
                  });
                  setBusy(false);
                  if (!result.ok) {
                    fail(result);
                    return;
                  }
                  toast("Ressource gespeichert.");
                  await loadRecords(locationId);
                }}
              >
                <label className="field-label">Name
                  <input aria-label={`Ressource ${index + 1}`} value={item.name} onChange={(event) => setResources((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} />
                </label>
                <label className="field-label">Kinderplätze
                  <input inputMode="numeric" value={String(item.capacityChildren)} onChange={(event) => setResources((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, capacityChildren: Number(event.target.value.replace(/\D/g, "") || "0") } : row))} />
                </label>
                <label className="field-label">Aktiv
                  <input type="checkbox" checked={item.status === "active"} onChange={(event) => setResources((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, status: event.target.checked ? "active" : "inactive" } : row))} />
                </label>
                <button className="button soft" type="submit" disabled={busy}>Speichern</button>
              </form>
            ))}
          </section>

          <section className="surface">
            <div className="section-head"><h2>Kombinationen</h2></div>
            {combinations.map((item, index) => (
              <form
                className="it-form"
                key={item.id}
                onSubmit={async (event) => {
                  event.preventDefault();
                  setBusy(true);
                  const result = await saveItCombination({
                    locationId,
                    combinationId: item.id,
                    name: item.name,
                    minChildren: item.minChildren,
                    maxChildren: item.maxChildren,
                    maxAdults: item.maxAdults,
                    status: item.status,
                    resourceIds: item.resourceIds,
                  });
                  setBusy(false);
                  if (!result.ok) {
                    fail(result);
                    return;
                  }
                  toast("Kombination gespeichert.");
                  await loadRecords(locationId);
                }}
              >
                <label className="field-label">Name
                  <input value={item.name} onChange={(event) => setCombinations((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} />
                </label>
                <label className="field-label">Kinder von
                  <input inputMode="numeric" value={String(item.minChildren)} onChange={(event) => setCombinations((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, minChildren: Number(event.target.value.replace(/\D/g, "") || "0") } : row))} />
                </label>
                <label className="field-label">Kinder bis
                  <input inputMode="numeric" value={String(item.maxChildren)} onChange={(event) => setCombinations((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, maxChildren: Number(event.target.value.replace(/\D/g, "") || "0") } : row))} />
                </label>
                <label className="field-label">Erwachsene bis
                  <input inputMode="numeric" value={String(item.maxAdults)} onChange={(event) => setCombinations((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, maxAdults: Number(event.target.value.replace(/\D/g, "") || "0") } : row))} />
                </label>
                <fieldset className="it-checks">
                  <legend>Tische</legend>
                  {resources.map((resource) => (
                    <label key={resource.id}>
                      <input
                        type="checkbox"
                        checked={item.resourceIds.includes(resource.id)}
                        onChange={(event) => setCombinations((current) => current.map((row, rowIndex) => {
                          if (rowIndex !== index) return row;
                          const resourceIds = event.target.checked
                            ? [...row.resourceIds, resource.id]
                            : row.resourceIds.filter((id) => id !== resource.id);
                          return { ...row, resourceIds };
                        }))}
                      />
                      {resource.name}
                    </label>
                  ))}
                </fieldset>
                <button className="button soft" type="submit" disabled={busy || item.resourceIds.length === 0}>Speichern</button>
              </form>
            ))}
          </section>

          <section className="surface">
            <div className="section-head"><h2>Schließzeiten</h2></div>
            <form
              className="it-form"
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                const result = await addItClosure({ locationId, ...closure });
                setBusy(false);
                if (!result.ok) {
                  fail(result);
                  return;
                }
                toast("Schließzeit gespeichert.");
                setClosure({ startsOn: closure.startsOn, endsOn: closure.endsOn, reason: "" });
                await loadRecords(locationId);
              }}
            >
              <label className="field-label">Von
                <input type="date" required aria-label="Schließzeit von" value={closure.startsOn} onChange={(event) => setClosure((current) => ({ ...current, startsOn: event.target.value }))} />
              </label>
              <label className="field-label">Bis
                <input type="date" required aria-label="Schließzeit bis" value={closure.endsOn} onChange={(event) => setClosure((current) => ({ ...current, endsOn: event.target.value }))} />
              </label>
              <label className="field-label">Grund
                <input required aria-label="Grund der Schließzeit" value={closure.reason} onChange={(event) => setClosure((current) => ({ ...current, reason: event.target.value }))} />
              </label>
              <button className="button dark" type="submit" disabled={busy}>Schließzeit hinzufügen</button>
            </form>
            {records && records.closures.length === 0 ? <p>Keine Schließzeit.</p> : null}
            {records && records.closures.length > 0 ? (
              <table className="it-table">
                <thead><tr><th>Von</th><th>Bis</th><th>Grund</th></tr></thead>
                <tbody>
                  {records.closures.map((item) => (
                    <tr key={item.id}><td>{dateLabel(item.startsOn)}</td><td>{dateLabel(item.endsOn)}</td><td>{item.reason}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>

          <section className="surface">
            <div className="section-head"><h2>Veröffentlichter Slug</h2></div>
            <p className="fine-print">Sichtbar ist nur der öffentliche Slug. Ein Standortschlüssel wird hier nicht angezeigt. Eine Venue-Regel wird von diesem Bildschirm nicht veröffentlicht.</p>
            {records?.venue ? (
              <form
                className="it-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setBusy(true);
                  const result = await saveItVenue({ locationId, publicSlug: slug.trim() });
                  setBusy(false);
                  if (!result.ok) {
                    fail(result);
                    return;
                  }
                  toast("Slug gespeichert.");
                  await loadRecords(locationId);
                }}
              >
                <label className="field-label">Slug
                  <input aria-label="Veröffentlichter Slug" value={slug} onChange={(event) => setSlug(event.target.value)} />
                </label>
                <span>{statusLabel[records.venue.status] ?? records.venue.status}</span>
                <button className="button soft" type="submit" disabled={busy}>Slug speichern</button>
              </form>
            ) : <p>Kein veröffentlichter Standort.</p>}
          </section>

          <section className="surface">
            <div className="section-head"><h2>Reservierungen</h2></div>
            <p className="fine-print">Telefon und Notiz gehen über den Buchungsservice. Stornieren und Verschieben bleiben dort. Andere Felder bleiben unverändert.</p>
            {records?.reservationsDenied ? <p>Reservierungen sind für diese Rolle nicht freigegeben.</p> : null}
            {records && records.reservations.length === 0 ? <p>Keine Reservierung im geladenen Zeitraum.</p> : null}
            {selectedReservation ? (
              <form
                className="it-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setBusy(true);
                  const result = await saveReservationContact({
                    reservationId: selectedReservation.id,
                    expectedVersion: selectedReservation.version,
                    organizerPhone: phone,
                    notes,
                  });
                  setBusy(false);
                  if (!result.ok) {
                    fail(result);
                    await loadRecords(locationId);
                    return;
                  }
                  toast("Telefon und Notiz gespeichert.");
                  await loadRecords(locationId);
                }}
              >
                <label className="field-label">Reservierung
                  <select
                    aria-label="Reservierung"
                    value={reservationId}
                    onChange={(event) => {
                      const next = records?.reservations.find((item) => item.id === event.target.value);
                      setReservationId(event.target.value);
                      setConfirmCancel(false);
                      if (!next) return;
                      setPhone(next.organizerPhone);
                      setNotes(next.notes);
                      setMoveDate(next.localDate);
                      setMoveTime(next.localTime);
                    }}
                  >
                    {records?.reservations.map((item) => (
                      <option key={item.id} value={item.id}>{dateLabel(item.localDate)} {item.localTime} · {item.organizerName} · {item.reference}</option>
                    ))}
                  </select>
                </label>
                <label className="field-label">Telefon
                  <input aria-label="Telefon" value={phone} onChange={(event) => setPhone(event.target.value)} />
                </label>
                <label className="field-label">Notiz
                  <input aria-label="Notiz" value={notes} onChange={(event) => setNotes(event.target.value)} />
                </label>
                <button className="button dark" type="submit" disabled={busy}>Telefon und Notiz speichern</button>
              </form>
            ) : null}
            {selectedReservation && (selectedReservation.status === "confirmed" || selectedReservation.status === "requested") ? (
              <form
                className="it-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setBusy(true);
                  const result = await rescheduleItReservation({
                    reservationId: selectedReservation.id,
                    expectedVersion: selectedReservation.version,
                    localDate: moveDate,
                    localTime: moveTime,
                  });
                  setBusy(false);
                  if (!result.ok) {
                    fail(result);
                    await loadRecords(locationId);
                    return;
                  }
                  toast("Reservierung verschoben.");
                  await loadRecords(locationId);
                }}
              >
                <label className="field-label">Neues Datum
                  <input type="date" required value={moveDate} onChange={(event) => setMoveDate(event.target.value)} />
                </label>
                <label className="field-label">Neue Uhrzeit
                  <input required value={moveTime} onChange={(event) => setMoveTime(event.target.value)} pattern="\d{2}:\d{2}" />
                </label>
                <button className="button soft" type="submit" disabled={busy}>Verschieben</button>
                {confirmCancel ? (
                  <button
                    className="button soft"
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      const result = await cancelItReservation({
                        reservationId: selectedReservation.id,
                        expectedVersion: selectedReservation.version,
                      });
                      setBusy(false);
                      setConfirmCancel(false);
                      if (!result.ok) {
                        fail(result);
                        await loadRecords(locationId);
                        return;
                      }
                      toast("Reservierung storniert.");
                      await loadRecords(locationId);
                    }}
                  >
                    Stornierung bestätigen
                  </button>
                ) : (
                  <button className="button soft" type="button" onClick={() => setConfirmCancel(true)}>Stornieren</button>
                )}
              </form>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
