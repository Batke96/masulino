import { weekday } from "./period";

export type BookingKind = "group" | "birthday";

export type TimeWindow = {
  start: string;
  end: string;
};

/**
 * Hessische Schulferien, erster bis letzter Ferientag.
 * Schuljahr 2026/27 laut Kultusministerium Hessen.
 * Sommerferien 2026 aus der veröffentlichten Sommerferienregelung.
 * Bewegliche Ferientage fehlen: die legt jede Schule selbst fest.
 */
const schoolHolidays: ReadonlyArray<readonly [string, string]> = [
  ["2026-06-29", "2026-08-07"],
  ["2026-10-05", "2026-10-17"],
  ["2026-12-23", "2027-01-12"],
  ["2027-03-22", "2027-04-02"],
  ["2027-06-28", "2027-08-06"],
];

const weekendBirthdays: TimeWindow[] = [
  { start: "10:00", end: "13:30" },
  { start: "11:00", end: "14:30" },
  { start: "15:30", end: "19:00" },
];

const groupWindow: TimeWindow = { start: "09:00", end: "13:00" };

export function windowLabel(window: TimeWindow): string {
  return `${window.start}–${window.end}`;
}

export function toMinute(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function startsWithin(time: string, window: TimeWindow): boolean {
  const minute = toMinute(time);
  const start = toMinute(window.start);
  const end = toMinute(window.end);
  if (minute === null || start === null || end === null) return false;
  return minute >= start && minute < end;
}

function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shift(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isPublicHoliday(iso: string): boolean {
  const year = Number(iso.slice(0, 4));
  const easter = easterSunday(year);
  const holidays = new Set([
    `${year}-01-01`,
    shift(easter, -2),
    shift(easter, 1),
    `${year}-05-01`,
    shift(easter, 39),
    shift(easter, 50),
    shift(easter, 60),
    `${year}-10-03`,
    `${year}-12-25`,
    `${year}-12-26`,
  ]);
  return holidays.has(iso);
}

export function isSchoolHoliday(iso: string): boolean {
  return schoolHolidays.some(([start, end]) => iso >= start && iso <= end);
}

function isWeekend(iso: string): boolean {
  const day = weekday(iso);
  return day === 0 || day === 6;
}

export function windowsFor(iso: string, kind: BookingKind): TimeWindow[] {
  const closed = isWeekend(iso) || isPublicHoliday(iso);
  if (kind === "group") return closed ? [] : [groupWindow];
  const monthDay = iso.slice(5);
  if (monthDay === "12-24") return [{ start: "12:00", end: "17:00" }];
  if (monthDay === "01-01") return [{ start: "12:00", end: "19:00" }];
  if (closed) return weekendBirthdays;
  if (isSchoolHoliday(iso)) return [{ start: "12:00", end: "19:00" }];
  return [{ start: "14:30", end: "19:00" }];
}
