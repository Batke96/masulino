"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Cake, Users } from "lucide-react";
import { DataTable, type DataColumn } from "@/components/data-table";
import { Block } from "@/components/ui/block";
import { JellyButton } from "@/components/ui/jelly-button";
import { RowAction } from "@/components/ui/row-action";
import { actionIcon } from "@/lib/ui/actions";
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

export function ListSearch({ query, onChange }: { query: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const expanded = open || query.length > 0;
  const SearchIcon = actionIcon("search");

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  return (
    <div className={expanded ? "list-search is-open" : "list-search"}>
      {expanded ? (
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Suchen"
          aria-label="In der Liste suchen"
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && event.currentTarget.parentElement?.contains(next)) return;
            if (!query) setOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            onChange("");
            setOpen(false);
          }}
        />
      ) : null}
      <JellyButton
        variant="icon"
        aria-label="Suchen"
        aria-expanded={expanded}
        onClick={() => setOpen(true)}
      >
        <SearchIcon size={16} strokeWidth={1.8} aria-hidden="true" />
      </JellyButton>
    </div>
  );
}

export function BookingSchedule({
  title,
  rows,
  canRemove,
  actions,
  tools,
  onOpen,
  onCheckIn,
  onRemove,
}: {
  title: string;
  rows: ScheduleRow[];
  canRemove: boolean;
  actions?: ReactNode;
  tools?: ReactNode;
  onOpen: (id: string) => void;
  onCheckIn: (id: string) => void;
  onRemove: (row: ScheduleRow) => Promise<boolean>;
}) {
  const inflight = useRef(new Set<string>());
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");

  async function remove(row: ScheduleRow) {
    if (inflight.current.has(row.id)) return;
    inflight.current.add(row.id);
    setRemoving((ids) => new Set(ids).add(row.id));
    try {
      await onRemove(row);
    } finally {
      inflight.current.delete(row.id);
      setRemoving((ids) => {
        const next = new Set(ids);
        next.delete(row.id);
        return next;
      });
    }
  }

  return (
    <Block
      title={title}
      count={rows.length}
      actions={<>{actions}<ListSearch query={query} onChange={setQuery} /></>}
      controls={tools}
    >
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          query={query}
          onQueryChange={setQuery}
          initialSort={{ id: "date", direction: "asc" }}
          empty={<div className="empty-state"><h3>Keine Buchung</h3><p>In diesem Zeitraum steht hier nichts an.</p></div>}
          actions={(row) => (
            <>
              <RowAction action="open" rowName={row.name} onClick={() => onOpen(row.id)} />
              <RowAction action="checkIn" rowName={row.name} pressed={row.checkedIn} onClick={() => onCheckIn(row.id)} />
              {canRemove ? <RowAction action="remove" rowName={row.name} disabled={removing.has(row.id)} onClick={() => { void remove(row); }} /> : null}
            </>
          )}
        />
    </Block>
  );
}
