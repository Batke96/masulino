"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Cake, Info, Users, X } from "lucide-react";
import { toast } from "sonner";
import { DataTable, type DataColumn } from "@/components/data-table";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ActionButton } from "@/components/ui/row-action";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PeriodToggle } from "@/components/period-toggle";
import { formatDayLabel, periodDates, type BookingPeriod } from "@/lib/booking/period";
import {
  decideWebsiteRequest,
  fetchWebsiteRequests,
  type WebsiteBirthdayPayload,
  type WebsiteKitaPayload,
  type WebsiteRequestRow,
  type WebsiteRequestStatus,
} from "@/lib/workspace/client";

const statusLabel: Record<WebsiteRequestStatus, string> = {
  angefragt: "Angefragt",
  bearbeitet: "Bearbeitet",
  angenommen: "Angenommen",
  abgelehnt: "Abgelehnt",
};

function statusTone(status: WebsiteRequestStatus): string {
  if (status === "angefragt") return "amber";
  if (status === "bearbeitet") return "blue";
  if (status === "angenommen") return "green";
  return "";
}

function euro(cents: number): string {
  const whole = Math.trunc(cents / 100).toLocaleString("de-DE");
  const fraction = String(Math.abs(cents % 100)).padStart(2, "0");
  return `${whole},${fraction} €`;
}

function dayLabel(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}.${month}.${year}`;
}

function requestDate(row: WebsiteRequestRow): string {
  if (!row.payload) return "";
  return row.payload.buchung === "geburtstag" ? row.payload.datum : row.payload.wunschtermin;
}

function requestTime(row: WebsiteRequestRow): string {
  if (!row.payload) return "";
  return row.payload.zeitfenster.slice(0, 5);
}

function dateKey(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return Number(iso.replaceAll("-", ""));
}

function timeKey(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

const requestColumns: DataColumn<WebsiteRequestRow>[] = [
  {
    id: "kind",
    label: "Art",
    kind: "text",
    raw: (row) => (row.kind === "geburtstag" ? "Geburtstag" : "Kita"),
    text: (row) => (row.kind === "geburtstag" ? "Geburtstag" : "Kita"),
    render: (row) => (
      <span className={"icon-tile small " + (row.kind === "geburtstag" ? "violet" : "green")} aria-hidden="true">
        {row.kind === "geburtstag" ? <Cake size={18} strokeWidth={1.8} /> : <Users size={18} strokeWidth={1.8} />}
      </span>
    ),
  },
  {
    id: "date",
    label: "Tag",
    kind: "number",
    raw: (row) => dateKey(requestDate(row)),
    text: (row) => {
      const date = requestDate(row);
      return date ? formatDayLabel(date) : "—";
    },
  },
  {
    id: "time",
    label: "Uhrzeit",
    kind: "number",
    raw: (row) => timeKey(requestTime(row)),
    text: (row) => requestTime(row) || "—",
  },
  {
    id: "name",
    label: "Name",
    kind: "text",
    raw: requestName,
    text: requestName,
    render: (row) => <strong>{requestName(row)}</strong>,
  },
  {
    id: "people",
    label: "Personen",
    kind: "number",
    raw: (row) => (row.payload ? row.payload.kinder : null),
    text: requestPeople,
  },
  {
    id: "price",
    label: "Preis",
    kind: "number",
    raw: (row) => row.payload?.summeVorschau ?? null,
    text: (row) => (row.payload ? euro(row.payload.summeVorschau) : "—"),
  },
  {
    id: "status",
    label: "Status",
    kind: "status",
    raw: (row) => row.status,
    text: (row) => statusLabel[row.status],
    render: (row) => <span className={"pill " + statusTone(row.status)}>{statusLabel[row.status]}</span>,
  },
];

function receivedLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function requestName(row: WebsiteRequestRow): string {
  if (!row.payload) return "Unvollständige Anfrage";
  if (row.payload.buchung === "geburtstag") return `${row.payload.vorname} ${row.payload.nachname}`;
  return row.payload.einrichtung;
}

function requestWhen(row: WebsiteRequestRow): string {
  if (!row.payload) return "—";
  if (row.payload.buchung === "geburtstag") return `${dayLabel(row.payload.datum)} · ${row.payload.zeitfenster}`;
  return `${dayLabel(row.payload.wunschtermin)} · ${row.payload.zeitfenster}`;
}

function requestPeople(row: WebsiteRequestRow): string {
  if (!row.payload) return "—";
  if (row.payload.buchung === "geburtstag") {
    return `${row.payload.kinder} Kinder, ${row.payload.erwachsene} Erwachsene`;
  }
  return `${row.payload.kinder} Kinder, ${row.payload.paedagogen} Pädagogen, ${row.payload.begleitpersonen} Begleitpersonen`;
}

function textOrDash(value: string): string {
  return value.trim() ? value : "—";
}

function detailFields(row: WebsiteRequestRow): Array<{ label: string; value: string }> {
  const payload = row.payload;
  const head = [
    { label: "Eingang", value: receivedLabel(row.receivedAt) },
    { label: "Status", value: statusLabel[row.status] },
  ];
  if (row.reference) head.push({ label: "Buchung", value: row.reference });
  if (row.status === "abgelehnt") head.push({ label: "Grund", value: textOrDash(row.rejectionReason) });
  if (!payload) return [...head, { label: "Inhalt", value: "Die gespeicherten Felder lassen sich nicht anzeigen." }];
  if (payload.buchung === "geburtstag") return [...head, ...birthdayFields(payload)];
  return [...head, ...kitaFields(payload)];
}

function birthdayFields(payload: WebsiteBirthdayPayload): Array<{ label: string; value: string }> {
  return [
    { label: "Art", value: "Geburtstag" },
    { label: "Datum", value: dayLabel(payload.datum) },
    { label: "Zeitfenster", value: payload.zeitfenster },
    { label: "Paket", value: payload.paket === "deluxe" ? "Deluxe" : "Comfort" },
    { label: "Geburtstagskind", value: payload.kind_name },
    { label: "Alter", value: payload.kind_alter },
    { label: "Kinder", value: String(payload.kinder) },
    { label: "Kleinkinder", value: String(payload.kleinkinder) },
    { label: "Erwachsene", value: String(payload.erwachsene) },
    { label: "Erwachsenenzusatz", value: payload.erwachsenenZusatz ? "Ja" : "Nein" },
    { label: "Vorschau", value: euro(payload.summeVorschau) },
    { label: "Vorname", value: payload.vorname },
    { label: "Nachname", value: payload.nachname },
    { label: "Anrede", value: payload.anrede },
    { label: "Adresse", value: payload.adresse },
    { label: "PLZ", value: payload.plz },
    { label: "E-Mail", value: payload.email },
    { label: "Telefon", value: payload.telefon },
    { label: "Nachricht", value: textOrDash(payload.nachricht) },
    { label: "Quelle", value: textOrDash(payload.quelle) },
  ];
}

function kitaFields(payload: WebsiteKitaPayload): Array<{ label: string; value: string }> {
  return [
    { label: "Art", value: "Kita und Schule" },
    { label: "Wunschtermin", value: dayLabel(payload.wunschtermin) },
    { label: "Zeitfenster", value: payload.zeitfenster },
    { label: "Kinder", value: String(payload.kinder) },
    { label: "Pädagogen", value: String(payload.paedagogen) },
    { label: "Begleitpersonen", value: String(payload.begleitpersonen) },
    { label: "Vorschau", value: euro(payload.summeVorschau) },
    { label: "Einrichtung", value: payload.einrichtung },
    { label: "Einrichtungsart", value: payload.art },
    { label: "Ansprechpartner", value: payload.ansprechpartner },
    { label: "Anrede", value: payload.anrede },
    { label: "Adresse", value: payload.adresse },
    { label: "PLZ", value: payload.plz },
    { label: "E-Mail", value: payload.email },
    { label: "Telefon", value: payload.telefon },
    { label: "Nachricht", value: textOrDash(payload.nachricht) },
    { label: "Quelle", value: textOrDash(payload.quelle) },
  ];
}

function acceptNote(row: WebsiteRequestRow): string {
  if (!row.payload) return "Diese Anfrage kann so nicht angenommen werden.";
  if (row.payload.buchung === "geburtstag") {
    const start = row.payload.zeitfenster.slice(0, 5);
    return `Annehmen legt eine bestätigte Geburtstagsbuchung ab ${start} an. Dauer und Preis kommen aus dem Paket ${row.payload.paket === "deluxe" ? "Deluxe" : "Comfort"}, nicht aus der Vorschau ${euro(row.payload.summeVorschau)}. Die Website erhält keine Antwort, und es wird keine E-Mail verschickt.`;
  }
  return `Annehmen legt eine bestätigte Buchung von 09:00 bis 13:00 ohne Tisch an. Der Paketpreis im Bericht ist 0 €. Die Vorschau ${euro(row.payload.summeVorschau)} bleibt an der Anfrage. Pädagogen stehen in der Notiz. Die Website erhält keine Antwort.`;
}

export function BookingRequests({
  enabled,
  anchorDate,
  canAccept,
  canDecide,
  onChanged,
}: {
  enabled: boolean;
  anchorDate: string | null;
  canAccept: boolean;
  canDecide: boolean;
  onChanged: () => void;
}) {
  const [scope, setScope] = useState<"open" | "all">("open");
  const [period, setPeriod] = useState<BookingPeriod>("today");
  const [rows, setRows] = useState<WebsiteRequestRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [holdingAccept, setHoldingAccept] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    if (!enabled) return;
    const next = await fetchWebsiteRequests(scope);
    if (!next) {
      setFailed(true);
      setRows([]);
      return;
    }
    setFailed(false);
    setRows(next);
  }, [enabled, scope]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const next = await fetchWebsiteRequests(scope);
      if (cancelled) return;
      if (!next) {
        setFailed(true);
        setRows([]);
        return;
      }
      setFailed(false);
      setRows(next);
    })();
    const timer = window.setInterval(() => {
      void load();
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, scope, load]);

  const selected = rows?.find((row) => row.id === selectedId) ?? null;
  const open = Boolean(selected && (selected.status === "angefragt" || selected.status === "bearbeitet"));
  const visible = useMemo(() => {
    if (!rows) return null;
    if (!anchorDate) return rows;
    const allowed = new Set(periodDates(anchorDate, period));
    return rows.filter((row) => allowed.has(requestDate(row)));
  }, [anchorDate, period, rows]);

  async function run(action: "bearbeitet" | "ablehnen" | "annehmen") {
    if (!selected || busy) return;
    setBusy(true);
    setActionError("");
    const result = await decideWebsiteRequest(action, selected.id, reason);
    setBusy(false);
    if (!result.ok) {
      setActionError(result.reason);
      return;
    }
    if (action === "annehmen" && result.reference && result.localDate && result.localTime) {
      toast(`Buchung ${result.reference} angenommen`, {
        description: `${dayLabel(result.localDate)} um ${result.localTime}${result.durationMinutes ? `, ${result.durationMinutes} Minuten` : ""}. Keine Nachricht an die Website.`,
      });
      onChanged();
    } else if (action === "ablehnen") {
      toast("Anfrage abgelehnt", { description: "Es wurde keine Nachricht verschickt." });
    } else {
      toast("Als bearbeitet markiert");
    }
    setReason("");
    await load();
  }

  function openRequest(row: WebsiteRequestRow) {
    setSelectedId(row.id);
    setActionError("");
    setReason(row.rejectionReason);
  }

  return (
    <div className="list-block" aria-label="Buchungsanfragen">
      <div className="section-head">
        <div className="section-title">
          <h2>Buchungsanfragen</h2>
          <span className="pill amber">{enabled && visible ? String(visible.length) : "—"}</span>
        </div>
        {enabled ? (
          <div className="toolbar-end">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={scope}
              aria-label="Anfragen"
              className="bg-background *:data-[slot=toggle-group-item]:bg-background *:data-[slot=toggle-group-item]:px-3"
              onValueChange={(value) => {
                if (value === "open" || value === "all") setScope(value);
              }}
            >
              <ToggleGroupItem value="open">Offen</ToggleGroupItem>
              <ToggleGroupItem value="all">Alle Anfragen</ToggleGroupItem>
            </ToggleGroup>
            <PeriodToggle value={period} onChange={setPeriod} label="Zeitraum Anfragen" />
          </div>
        ) : null}
      </div>
      <p className="fine-print">Eingang von der Website. Eine Anfrage ist noch keine bestätigte Buchung.</p>
      <section className="surface">
        {!enabled ? (
          <div className="empty-state">
            <Info size={22} />
            <p>Buchungsanfragen von der Website erscheinen hier, sobald der Arbeitsplatz angemeldet ist.</p>
          </div>
        ) : failed ? (
          <div className="callout amber" role="alert">
            <Info size={22} strokeWidth={1.8} />
            <div>
              <strong>Buchungsanfragen nicht geladen</strong>
              <p>Der Eingang ist gerade nicht erreichbar. Die Liste bleibt leer, bis er wieder antwortet.</p>
            </div>
          </div>
        ) : rows === null ? (
          <div className="empty-state" aria-live="polite">
            <h3>Buchungsanfragen werden geladen.</h3>
          </div>
        ) : (
          <DataTable
            rows={visible ?? []}
            columns={requestColumns}
            rowKey={(row) => row.id}
            initialSort={{ id: "date", direction: "asc" }}
            empty={
              rows && rows.length > 0 ? (
                <div className="empty-state">
                  <h3>Keine Anfrage in diesem Zeitraum</h3>
                  <p>Ein anderer Zeitraum zeigt die übrigen Anfragen.</p>
                </div>
              ) : (
                <div className="empty-state">
                  <h3>{scope === "open" ? "Keine offenen Anfragen" : "Keine Anfragen"}</h3>
                  <p>{scope === "open" ? "Neue Anfragen von der Website erscheinen hier." : "Es ist noch nichts eingegangen."}</p>
                </div>
              )
            }
            actions={(row) => (
              <button type="button" className="button soft" onClick={() => openRequest(row)}>Öffnen</button>
            )}
          />
        )}
      </section>
      <Dialog open={selected !== null} onOpenChange={(openDialog) => { if (!openDialog) { setSelectedId(null); setActionError(""); setHoldingAccept(false); } }}>
        <DialogContent showCloseButton={false} className="request-dialog sm:max-w-none">
          <DialogClose className="icon-button modal-close" aria-label="Schließen"><X size={20} /></DialogClose>
          {selected ? (
            <>
              <div className="request-dialog-head">
                <div>
                  <DialogTitle>{requestName(selected)}</DialogTitle>
                  <DialogDescription>{requestWhen(selected)}</DialogDescription>
                </div>
                {open ? (
                  <div className="request-dialog-actions">
                    {canDecide ? (
                      <label className="field-label request-reason">
                        Grund beim Ablehnen
                        <input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
                      </label>
                    ) : null}
                    <div className="request-actions">
                      {canDecide ? <button type="button" className="button soft" disabled={busy || holdingAccept} onClick={() => void run("bearbeitet")}>Bearbeitet</button> : null}
                      {canDecide ? <button type="button" className="button soft" disabled={busy || holdingAccept} onClick={() => void run("ablehnen")}>Ablehnen</button> : null}
                      {canAccept ? <ActionButton action="accept" variant="dark" disabled={busy} onFuseStart={() => setHoldingAccept(true)} onFuseCancel={() => setHoldingAccept(false)} onClick={() => { setHoldingAccept(false); void run("annehmen"); }} /> : null}
                    </div>
                  </div>
                ) : null}
              </div>
              {actionError ? <div className="callout amber"><Info size={20} /><p>{actionError}</p></div> : null}
              {open ? <div className="callout blue"><Info size={20} /><p>{acceptNote(selected)}</p></div> : null}
              <dl className="request-fields">
                {detailFields(selected).map((field) => (
                  <div key={field.label}>
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
