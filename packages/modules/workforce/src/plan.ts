import { AppError } from "@masulino/contracts";
import { DateTime } from "luxon";

/** Proposed fixture rules. They are not a statement of German working-time law. */
export const fixtureCoverageRules = {
  status: "proposed" as const,
  bookedDayMinimumStaff: 1,
  childrenForSecondStaff: 16,
  breakWarningAfterMinutes: 360,
  minimumBreakMinutes: 30,
};

export type PlanWarning =
  | { code: "coverage_gap"; localDate: string; required: number; assigned: number }
  | { code: "overlap"; localDate: string; principalId: string }
  | { code: "break"; localDate: string; principalId: string; shiftMinutes: number; breakMinutes: number };

export type ShiftDraft = {
  principalId: string;
  localDate: string;
  startMinute: number;
  endMinute: number;
  breakMinutes: number;
};

export type AvailabilityWindowInput = {
  principalId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export type LeaveSpan = {
  principalId: string;
  startsOn: string;
  endsOn: string;
};

export type BookingFact = {
  localDate: string;
  childrenCount: number;
};

export function weekDates(weekStartsOn: string): string[] {
  const start = DateTime.fromISO(weekStartsOn, { zone: "utc" });
  if (!start.isValid || start.weekday !== 1) throw new AppError("validation", "week_start");
  return Array.from({ length: 7 }, (_, index) => start.plus({ days: index }).toFormat("yyyy-MM-dd"));
}

function weekdayOf(isoDate: string): number {
  const day = DateTime.fromISO(isoDate, { zone: "utc" }).weekday;
  return day === 7 ? 0 : day;
}

function onLeave(leave: readonly LeaveSpan[], principalId: string, isoDate: string): boolean {
  return leave.some(
    (span) => span.principalId === principalId && span.startsOn <= isoDate && span.endsOn >= isoDate,
  );
}

export function buildProposal(input: {
  weekStartsOn: string;
  windows: readonly AvailabilityWindowInput[];
  leave: readonly LeaveSpan[];
  bookings: readonly BookingFact[];
}): { shifts: ShiftDraft[]; warnings: PlanWarning[] } {
  const dates = weekDates(input.weekStartsOn);
  const shifts: ShiftDraft[] = [];
  for (const localDate of dates) {
    const weekday = weekdayOf(localDate);
    for (const window of input.windows) {
      if (window.weekday !== weekday) continue;
      if (onLeave(input.leave, window.principalId, localDate)) continue;
      shifts.push({
        principalId: window.principalId,
        localDate,
        startMinute: window.startMinute,
        endMinute: window.endMinute,
        breakMinutes: 0,
      });
    }
  }

  const warnings: PlanWarning[] = [];
  const byPerson = new Map<string, ShiftDraft[]>();
  for (const shift of shifts) {
    const key = `${shift.principalId}:${shift.localDate}`;
    const group = byPerson.get(key) ?? [];
    group.push(shift);
    byPerson.set(key, group);
    const minutes = shift.endMinute - shift.startMinute;
    if (
      minutes > fixtureCoverageRules.breakWarningAfterMinutes &&
      shift.breakMinutes < fixtureCoverageRules.minimumBreakMinutes
    ) {
      warnings.push({
        code: "break",
        localDate: shift.localDate,
        principalId: shift.principalId,
        shiftMinutes: minutes,
        breakMinutes: shift.breakMinutes,
      });
    }
  }
  for (const group of byPerson.values()) {
    const ordered = [...group].sort((left, right) => left.startMinute - right.startMinute);
    for (let index = 0; index < ordered.length; index += 1) {
      const current = ordered[index];
      const next = ordered[index + 1];
      if (!current || !next) continue;
      if (current.startMinute < next.endMinute && next.startMinute < current.endMinute) {
        warnings.push({
          code: "overlap",
          localDate: current.localDate,
          principalId: current.principalId,
        });
      }
    }
  }

  for (const localDate of dates) {
    const dayBookings = input.bookings.filter((booking) => booking.localDate === localDate);
    if (dayBookings.length === 0) continue;
    const children = dayBookings.reduce((sum, booking) => sum + booking.childrenCount, 0);
    const required =
      children >= fixtureCoverageRules.childrenForSecondStaff
        ? 2
        : fixtureCoverageRules.bookedDayMinimumStaff;
    const assigned = new Set(
      shifts.filter((shift) => shift.localDate === localDate).map((shift) => shift.principalId),
    ).size;
    if (assigned < required) {
      warnings.push({ code: "coverage_gap", localDate, required, assigned });
    }
  }

  return { shifts, warnings };
}
