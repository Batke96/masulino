export type SortKind = "text" | "number" | "datetime" | "boolean" | "status";
export type SortDirection = "asc" | "desc";
export type SortValue = string | number | boolean | null | undefined;

const statusOrder = ["angefragt", "bearbeitet", "angenommen", "abgelehnt"];

function isEmpty(value: SortValue): boolean {
  return value === null || value === undefined || value === "" || (typeof value === "number" && Number.isNaN(value));
}

function statusRank(value: SortValue): number {
  const index = statusOrder.indexOf(String(value));
  return index === -1 ? statusOrder.length : index;
}

function comparePresent(kind: SortKind, left: SortValue, right: SortValue): number {
  if (kind === "text") return String(left).localeCompare(String(right), "de");
  if (kind === "boolean") return Number(left !== true) - Number(right !== true);
  if (kind === "status") {
    const byRank = statusRank(left) - statusRank(right);
    return byRank !== 0 ? byRank : String(left).localeCompare(String(right), "de");
  }
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), "de");
}

/** Empty values stay at the end in both directions. */
export function compareSort(kind: SortKind, left: SortValue, right: SortValue, direction: SortDirection): number {
  const leftEmpty = isEmpty(left);
  const rightEmpty = isEmpty(right);
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;
  const result = comparePresent(kind, left, right);
  return direction === "desc" ? -result : result;
}

export function matchesColumn(query: string, text: string): boolean {
  const needle = query.trim().toLocaleLowerCase("de");
  if (!needle) return true;
  return text.toLocaleLowerCase("de").includes(needle);
}

/** A row matches when the query appears in any visible column. */
export function matchesAnyColumn(query: string, texts: readonly string[]): boolean {
  return texts.some((text) => matchesColumn(query, text));
}

/** Days in the past become a negative key so an older visit sorts earlier. */
export function visitSortKey(label: string): number | null {
  const ago = /^vor (\d+) Tag(?:en)?$/.exec(label.trim());
  if (ago) return -Number(ago[1]);
  if (/^\d{4}-\d{2}-\d{2}$/.test(label.trim())) return Number(label.replaceAll("-", ""));
  return null;
}
