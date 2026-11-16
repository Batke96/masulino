export const bookingPeriods = [
  { id: "today", label: "Heute" },
  { id: "tomorrow", label: "Morgen" },
  { id: "threeDays", label: "3 Tage" },
  { id: "thisWeek", label: "diese Woche" },
  { id: "nextWeek", label: "nächste Woche" },
] as const;

export type BookingPeriod = (typeof bookingPeriods)[number]["id"];

export function periodLabel(period: BookingPeriod): string {
  return bookingPeriods.find((item) => item.id === period)?.label ?? "Heute";
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekday(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
}

export function formatDayLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

function mondayOf(iso: string): string {
  const day = weekday(iso);
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(iso, diff);
}

function daysThrough(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

export function periodDates(anchor: string, period: BookingPeriod): string[] {
  if (period === "today") return [anchor];
  if (period === "tomorrow") return [addDays(anchor, 1)];
  if (period === "threeDays") return daysThrough(anchor, 3);
  const monday = mondayOf(anchor);
  if (period === "nextWeek") return daysThrough(addDays(monday, 7), 7);
  return daysThrough(monday, 7);
}

export function periodDatesUnion(anchor: string, periods: readonly BookingPeriod[]): string[] {
  const dates = new Set<string>();
  for (const period of periods) {
    for (const date of periodDates(anchor, period)) dates.add(date);
  }
  return [...dates].sort();
}

export function browserLocalDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
