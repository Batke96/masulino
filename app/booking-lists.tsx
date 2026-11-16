"use client";

import { useState, type ReactNode } from "react";
import { Cake, Check, Users } from "lucide-react";
import { DataTable, type DataColumn } from "@/components/data-table";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatDayLabel } from "@/lib/booking/period";

export type ScheduleRow = {
  id: string;
  kind: "geburtstag" | "kita";
  date: string;
  time: string;
  name: string;
  children: number;
  adults: number;
  tableLabel: string;
  checkedIn: boolean;
  version?: number;
};

function minutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function dateKey(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return Number(iso.replaceAll("-", ""));
}

function people(row: ScheduleRow): string {
  return `${row.children} Kinder, ${row.adults} Erwachsene`;
}

const columns: DataColumn<ScheduleRow>[] = [
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
    raw: (row) => dateKey(row.date),
    text: (row) => (row.date ? formatDayLabel(row.date) : "—"),
  },
  {
    id: "time",
    label: "Uhrzeit",
    kind: "number",
    raw: (row) => minutes(row.time),
    text: (row) => row.time || "—",
  },
  {
    id: "name",
    label: "Name",
    kind: "text",
    raw: (row) => row.name,
    text: (row) => row.name,
    render: (row) => <strong>{row.name}</strong>,
  },
  {
    id: "people",
    label: "Personen",
    kind: "number",
    raw: (row) => row.children * 1000 + row.adults,
    text: people,
  },
  {
    id: "table",
    label: "Tisch",
    kind: "text",
    raw: (row) => row.tableLabel,
    text: (row) => row.tableLabel,
  },
];

export function BookingSchedule({
  title,
  rows,
  canRemove,
  tools,
  onOpen,
  onCheckIn,
  onRemove,
}: {
  title: string;
  rows: ScheduleRow[];
  canRemove: boolean;
  tools?: ReactNode;
  onOpen: (id: string) => void;
  onCheckIn: (id: string) => void;
  onRemove: (row: ScheduleRow) => Promise<boolean>;
}) {
  const [pending, setPending] = useState<ScheduleRow | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!pending || busy) return;
    setBusy(true);
    const removed = await onRemove(pending);
    setBusy(false);
    if (removed) setPending(null);
  }

  return (
    <div className="list-block">
      <div className="section-head">
        <div className="section-title">
          <h2>{title}</h2>
          <span className="pill">{rows.length.toLocaleString("de-DE")}</span>
        </div>
        {tools}
      </div>
      <section className="surface">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          initialSort={{ id: "date", direction: "asc" }}
          empty={<div className="empty-state"><h3>Keine Buchung</h3><p>In diesem Zeitraum steht hier nichts an.</p></div>}
          actions={(row) => (
            <>
              <button type="button" className="button soft" onClick={() => onOpen(row.id)}>Öffnen</button>
              <button type="button" className={"button checkin " + (row.checkedIn ? "checked" : "")} onClick={() => onCheckIn(row.id)}>
                {row.checkedIn ? <><Check size={14} strokeWidth={1.8} />Check-in aufheben</> : "Check-in"}
              </button>
              {canRemove ? <button type="button" className="button soft" onClick={() => setPending(row)}>Buchung entfernen</button> : null}
            </>
          )}
        />
      </section>
      <Dialog open={pending !== null} onOpenChange={(open) => { if (!open && !busy) setPending(null); }}>
        <DialogContent showCloseButton={false} className="article-dialog">
          <DialogTitle>Buchung entfernen</DialogTitle>
          <DialogDescription>
            {pending ? `${pending.name} wird storniert. Der Tisch wird frei. Es geht keine Nachricht an die Website.` : ""}
          </DialogDescription>
          <div className="request-actions">
            <button type="button" className="button soft" disabled={busy} onClick={() => setPending(null)}>Abbrechen</button>
            <button type="button" className="button dark" disabled={busy} onClick={() => void confirm()}>{busy ? "Wird storniert …" : "Stornieren"}</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
