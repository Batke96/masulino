"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { compareSort, matchesAnyColumn, type SortDirection, type SortKind, type SortValue } from "@/lib/tables/sort";

export type DataColumn<Row> = {
  id: string;
  label: string;
  kind: SortKind;
  raw: (row: Row) => SortValue;
  text: (row: Row) => string;
  render?: (row: Row) => ReactNode;
};

export function DataTable<Row>({
  rows,
  columns,
  rowKey,
  actions,
  actionLabel = "Aktion",
  empty,
  emptyFiltered = "Keine Zeile passt zur Suche.",
  initialSort,
  query: controlledQuery,
  onQueryChange,
}: {
  rows: Row[];
  columns: DataColumn<Row>[];
  rowKey: (row: Row) => string;
  actions?: (row: Row) => ReactNode;
  actionLabel?: string;
  empty: ReactNode;
  emptyFiltered?: ReactNode;
  initialSort?: { id: string; direction: SortDirection };
  query?: string;
  onQueryChange?: (query: string) => void;
}) {
  const [sort, setSort] = useState<{ id: string; direction: SortDirection } | null>(initialSort ?? null);
  const [localQuery, setLocalQuery] = useState("");
  const query = onQueryChange ? (controlledQuery ?? "") : localQuery;
  function setQuery(value: string) {
    if (onQueryChange) onQueryChange(value);
    else setLocalQuery(value);
  }
  const filtered = useMemo(() => {
    const matched = rows.filter((row) => matchesAnyColumn(query, columns.map((column) => column.text(row))));
    if (!sort) return matched;
    const column = columns.find((item) => item.id === sort.id);
    if (!column) return matched;
    return [...matched].sort((left, right) =>
      compareSort(column.kind, column.raw(left), column.raw(right), sort.direction),
    );
  }, [columns, query, rows, sort]);

  function toggleSort(id: string) {
    setSort((current) => {
      if (!current || current.id !== id) return { id, direction: "asc" };
      return { id, direction: current.direction === "asc" ? "desc" : "asc" };
    });
  }

  if (rows.length === 0) return <>{empty}</>;

  return (
    <div className="data-table-block">
      {onQueryChange ? null : (
        <label className="table-search">
          <span className="sr-only">In der Liste suchen</span>
          <input
            type="search"
            value={query}
            placeholder="Suchen"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      )}
      <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sort?.id === column.id ? sort.direction : null;
              return (
                <th key={column.id} aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}>
                  <button type="button" className="data-sort" onClick={() => toggleSort(column.id)}>
                    {column.label}
                    {active === "asc" ? <ArrowUp size={16} strokeWidth={1.8} aria-hidden="true" /> : null}
                    {active === "desc" ? <ArrowDown size={16} strokeWidth={1.8} aria-hidden="true" /> : null}
                  </button>
                </th>
              );
            })}
            {actions ? <th className="data-action-head">{actionLabel}</th> : null}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (actions ? 1 : 0)}>
                <div className="empty-state"><h3>{emptyFiltered}</h3></div>
              </td>
            </tr>
          ) : filtered.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.id}>{column.render ? column.render(row) : column.text(row)}</td>
              ))}
              {actions ? <td className="data-actions">{actions(row)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
