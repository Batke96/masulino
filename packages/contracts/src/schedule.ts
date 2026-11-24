const enDash = "\u2013";

export const scheduleTimeZone = "Europe/Berlin";

export const publicHours = {
  regularWeekday: { opensAt: "14:00", closesAt: "19:00" },
  weekendAndHoliday: { opensAt: "10:00", closesAt: "19:00" },
  vacationWeekday: { opensAt: "12:00", closesAt: "19:00" },
} as const;

export const groupVisitWindow = { opensAt: "09:00", closesAt: "13:00" } as const;

export const vacationRanges = [
  { start: "2026-10-05", end: "2026-10-17" },
  { start: "2026-12-23", end: "2027-01-12" },
  { start: "2027-02-08", end: "2027-02-08" },
  { start: "2027-03-22", end: "2027-04-02" },
  { start: "2027-05-07", end: "2027-05-07" },
  { start: "2027-05-28", end: "2027-05-28" },
  { start: "2027-06-28", end: "2027-08-06" },
  { start: "2027-10-04", end: "2027-10-16" },
  { start: "2027-12-23", end: "2028-01-11" },
] as const;

type SpecialDay = {
  date: string;
  closed: boolean;
  opensAt: string;
  closesAt: string;
};

export const annualSpecialDays: readonly SpecialDay[] = [
  { date: "12-24", closed: false, opensAt: "12:00", closesAt: "17:00" },
  { date: "01-01", closed: false, opensAt: "12:00", closesAt: "19:00" },
];

const weekendBirthdays = [
  { start: "10:00", end: "13:30" },
  { start: "11:00", end: "14:30" },
  { start: "15:30", end: "19:00" },
] as const;

const weekdayBirthday = { start: "14:30", end: "19:00" } as const;
const vacationBirthday = { start: "12:00", end: "19:00" } as const;

export type ClockWindow = { start: string; end: string };

export type PublicOpening = { opensAt: string; closesAt: string };

export function websiteWindowLabel(window: ClockWindow): string {
  return `${window.start}${enDash}${window.end} Uhr`;
}

export const birthdayTimeWindows = [
  "14:30\u201319:00 Uhr",
  "12:00\u201319:00 Uhr",
  "10:00\u201313:30 Uhr",
  "11:00\u201314:30 Uhr",
  "15:30\u201319:00 Uhr",
  "12:00\u201317:00 Uhr",
] as const;

export const kitaTimeWindow = "09:00\u201313:00 Uhr" as const;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function easterSunday(year: number): { month: number; day: number } {
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
  return { month, day };
}

function shift(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function hesseHolidayDates(year: number): Set<string> {
  const easter = easterSunday(year);
  const goodFriday = shift(year, easter.month, easter.day, -2);
  const easterMonday = shift(year, easter.month, easter.day, 1);
  const ascension = shift(year, easter.month, easter.day, 39);
  const whitMonday = shift(year, easter.month, easter.day, 50);
  const corpusChristi = shift(year, easter.month, easter.day, 60);
  return new Set([
    dateKey(year, 1, 1),
    dateKey(goodFriday.year, goodFriday.month, goodFriday.day),
    dateKey(easterMonday.year, easterMonday.month, easterMonday.day),
    dateKey(year, 5, 1),
    dateKey(ascension.year, ascension.month, ascension.day),
    dateKey(whitMonday.year, whitMonday.month, whitMonday.day),
    dateKey(corpusChristi.year, corpusChristi.month, corpusChristi.day),
    dateKey(year, 10, 3),
    dateKey(year, 12, 25),
    dateKey(year, 12, 26),
  ]);
}

export function isCalendarWeekday(iso: string): boolean {
  const [year, month, day] = iso.split("-").map(Number);
  const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

export function isPublicHoliday(iso: string): boolean {
  const year = Number(iso.slice(0, 4));
  return hesseHolidayDates(year).has(iso);
}

export function isSchoolVacation(iso: string): boolean {
  return vacationRanges.some((span) => iso >= span.start && iso <= span.end);
}

function specialDay(iso: string): SpecialDay | undefined {
  const monthDay = iso.slice(5);
  return annualSpecialDays.find((day) => day.date === iso || day.date === monthDay);
}

type DayKind = {
  weekend: boolean;
  holiday: boolean;
  vacation: boolean;
  special: SpecialDay | undefined;
};

function describeDay(iso: string): DayKind {
  return {
    weekend: !isCalendarWeekday(iso),
    holiday: isPublicHoliday(iso),
    vacation: isSchoolVacation(iso),
    special: specialDay(iso),
  };
}

export function publicOpening(iso: string): PublicOpening | null {
  const day = describeDay(iso);
  if (day.special) {
    if (day.special.closed) return null;
    return { opensAt: day.special.opensAt, closesAt: day.special.closesAt };
  }
  if (day.weekend || day.holiday) return publicHours.weekendAndHoliday;
  if (day.vacation) return publicHours.vacationWeekday;
  return publicHours.regularWeekday;
}

export function clockToMinute(clock: string): number {
  const [hour, minute] = clock.split(":").map(Number);
  return hour! * 60 + minute!;
}

export function publicSpan(iso: string): { start: number; end: number } | null {
  const opening = publicOpening(iso);
  if (!opening) return null;
  return { start: clockToMinute(opening.opensAt), end: clockToMinute(opening.closesAt) };
}

export function birthdayWindows(iso: string): ClockWindow[] {
  const day = describeDay(iso);
  if (day.special) {
    if (day.special.closed) return [];
    return [{ start: day.special.opensAt, end: day.special.closesAt }];
  }
  if (day.weekend || day.holiday) return [...weekendBirthdays];
  if (day.vacation) return [vacationBirthday];
  return [weekdayBirthday];
}

export function groupWindows(iso: string): ClockWindow[] {
  if (!isCalendarWeekday(iso)) return [];
  return [{ start: groupVisitWindow.opensAt, end: groupVisitWindow.closesAt }];
}

export function birthdaySlotLabels(iso: string): string[] {
  return birthdayWindows(iso).map(websiteWindowLabel);
}
