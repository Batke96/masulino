import { addDays } from "./period";

/** Days drawn on the overview sparkline, ending with the anchor day. */
export const kpiHistoryDays = 7;

export type DatedCount = { date: string; type: string };

export function historyDates(anchor: string, days = kpiHistoryDays): string[] {
  return Array.from({ length: days }, (_, index) => addDays(anchor, index - (days - 1)));
}

export function seriesForDates(dates: string[], rows: DatedCount[], birthday: boolean): number[] {
  return dates.map((date) => rows.filter((row) => row.date === date && (!birthday || row.type === "Geburtstag")).length);
}

/**
 * Change against the previous day.
 * A jump up from zero has no percentage, so the badge stays off.
 */
export function deltaAgainstPrevious(series: number[]): number | undefined {
  const previous = series.at(-2);
  const current = series.at(-1);
  if (previous === undefined || current === undefined) return undefined;
  if (previous === 0) return current === 0 ? 0 : undefined;
  return (current - previous) / Math.abs(previous);
}

export function historyCaption(series: number[] | undefined, kind: "booking" | "birthday"): string {
  if (!series) return kind === "booking" ? "Reservierungen dieses Tages." : "Aus der Tagesliste.";
  if (deltaAgainstPrevious(series) === undefined) {
    return kind === "booking" ? "Letzte 7 Tage · gestern ohne Buchung." : "Letzte 7 Tage · gestern ohne Geburtstag.";
  }
  return "Gegen gestern";
}
