import {
  birthdayWindows,
  groupWindows,
  isPublicHoliday as dateIsPublicHoliday,
  isSchoolVacation,
  publicSpan,
} from "../../packages/contracts/src/schedule";
import { weekday } from "./period";

export type BookingKind = "group" | "birthday";

export type TimeWindow = {
  start: string;
  end: string;
};

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

export function isPublicHoliday(iso: string): boolean {
  return dateIsPublicHoliday(iso);
}

export function isSchoolHoliday(iso: string): boolean {
  return isSchoolVacation(iso);
}

function isWeekend(iso: string): boolean {
  const day = weekday(iso);
  return day === 0 || day === 6;
}

export function windowsFor(iso: string, kind: BookingKind): TimeWindow[] {
  if (kind === "group") return isWeekend(iso) ? [] : groupWindows(iso);
  return birthdayWindows(iso);
}

export { publicSpan };
