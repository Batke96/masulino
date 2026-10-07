import { AppError } from "@masulino/contracts";
import { DateTime } from "luxon";

export function localParts(instant: Date, timezone: string): { localDate: string; localTime: string } {
  const dt = DateTime.fromJSDate(instant, { zone: "utc" }).setZone(timezone);
  if (!dt.isValid) throw new AppError("validation", "invalid_local_time");
  return { localDate: dt.toFormat("yyyy-MM-dd"), localTime: dt.toFormat("HH:mm") };
}

export function parseVenueLocal(localDate: string, localTime: string, timezone: string): Date {
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
  return dt.toJSDate();
}

/** Sunday means the plan for the week that starts the next day. Other days use the Monday of the current week. */
export function defaultPlanMonday(timeZone: string, now = new Date()): string {
  const today = DateTime.fromJSDate(now, { zone: timeZone }).startOf("day");
  if (!today.isValid) throw new AppError("validation", "invalid_local_time");
  if (today.weekday === 7) return today.plus({ days: 1 }).toFormat("yyyy-MM-dd");
  return today.startOf("week").toFormat("yyyy-MM-dd");
}

export function weekdayIndex(isoDate: string): number {
  const day = DateTime.fromISO(isoDate, { zone: "utc" });
  if (!day.isValid) throw new AppError("validation", "invalid_local_time");
  return day.weekday === 7 ? 0 : day.weekday;
}
