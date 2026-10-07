import { AppError } from "@masulino/contracts";
import { DateTime } from "luxon";

const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function parseVenueLocal(localDate: string, localTime: string, timezone: string): DateTime {
  const dateParts = localDate.split("-").map(Number);
  const timeParts = localTime.split(":").map(Number);
  const year = dateParts[0];
  const month = dateParts[1];
  const day = dateParts[2];
  const hour = timeParts[0];
  const minute = timeParts[1];
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  ) {
    throw new AppError("validation", "invalid_local_time");
  }
  const dt = DateTime.fromObject(
    { year, month, day, hour, minute, second: 0, millisecond: 0 },
    { zone: timezone },
  );
  if (!dt.isValid || dt.toFormat("yyyy-MM-dd'T'HH:mm") !== `${localDate}T${localTime}`) {
    throw new AppError("validation", "invalid_local_time");
  }
  const clock = dt.toFormat("HH:mm");
  const neighbors = [dt.minus({ hours: 1 }), dt.plus({ hours: 1 })];
  if (neighbors.some((neighbor) => neighbor.offset !== dt.offset && neighbor.toFormat("HH:mm") === clock)) {
    throw new AppError("validation", "ambiguous_local_time");
  }
  return dt;
}

export function weekdayKey(dt: DateTime): (typeof weekdays)[number] {
  const key = weekdays[dt.weekday - 1];
  if (!key) throw new AppError("validation", "invalid_local_time");
  return key;
}

export function minutesOfDay(dt: DateTime): number {
  return dt.hour * 60 + dt.minute;
}

export function reminderAt(localDate: string, timezone: string): Date {
  const party = DateTime.fromISO(localDate, { zone: timezone }).startOf("day");
  const reminder = party.minus({ days: 1 }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
  if (!party.isValid || !reminder.isValid) {
    throw new AppError("validation", "reminder_time");
  }
  return reminder.toJSDate();
}
