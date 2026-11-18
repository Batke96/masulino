export const SLICE_MINUTES = 15;

export function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) return null;
  return hours * 60 + minutes;
}

export function formatTime(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatRange(start: number, end: number): string {
  return `${formatTime(start)}–${formatTime(end)}`;
}

export function durationLabel(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (hours === 0) return `${rest} Min.`;
  if (rest === 0) return `${hours} Std.`;
  return `${hours} Std. ${rest} Min.`;
}

export function hoursLabel(minutes: number): string {
  const hours = minutes / 60;
  const text = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(".", ",");
  return `${text} Std.`;
}

export function hourOptions(from: number, to: number): { value: string; label: string }[] {
  const items: { value: string; label: string }[] = [];
  for (let hour = from; hour <= to; hour += 1) {
    const text = formatTime(hour * 60);
    items.push({ value: text, label: text });
  }
  return items;
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekdayIndex(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
}

function utcDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

export function formatShortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}.${month}.`;
}

export function formatFullDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

export function formatCompactDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year?.slice(2)}`;
}

export function formatWeekdayShort(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" })
    .format(utcDate(iso))
    .replace(".", "");
}

export function formatWeekdayLong(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", { weekday: "long", timeZone: "UTC" }).format(utcDate(iso));
}

export function formatDayHeading(iso: string): string {
  return `${formatWeekdayShort(iso)}, ${formatFullDate(iso)}`;
}

export function formatWeekRange(start: string, end: string): string {
  const [, startMonth, startDay] = start.split("-");
  const [, endMonth, endDay] = end.split("-");
  const monthName = new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: "UTC" }).format(utcDate(end));
  if (startMonth === endMonth) return `${startDay}.–${endDay}. ${monthName}`;
  const startName = new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: "UTC" }).format(utcDate(start));
  return `${startDay}. ${startName}–${endDay}. ${monthName}`;
}

export function compactRange(start: number, end: number): string {
  const part = (minute: number) => (minute % 60 === 0 ? String(minute / 60) : formatTime(minute));
  return `${part(start)}–${part(end)}`;
}

export function formatExceptionRange(start: string, end: string): string {
  return start === end ? `${formatWeekdayShort(start)}, ${formatFullDate(start)}` : `${formatFullDate(start)} bis ${formatFullDate(end)}`;
}
