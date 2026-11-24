import { formatRange, formatTime } from "./time";
import { nextId, weekdayKeyOf } from "./rules";
import {
  NOON,
  exceptionLabels,
  weekdayKeys,
  type Availability,
  type AvailabilityDay,
  type AvailabilityException,
  type Employee,
  type ExceptionKind,
  type WeekdayKey,
} from "./types";

export function emptyAvailability(): Availability {
  const day = (): AvailabilityDay => ({ available: false, from: 10 * 60, to: 19 * 60 });
  return { mo: day(), di: day(), mi: day(), do: day(), fr: day(), sa: day(), so: day() };
}

export function newEmployeeDraft(existing: readonly { id: string }[]): { employee: Employee; availability: Availability } {
  return {
    employee: {
      id: nextId("emp", existing),
      name: "",
      role: "mitarbeiter",
      targetHours: 0,
      maxHours: 40,
      priority: "standard",
      skills: { kasse: false, reinigung: false, oeffnung: false, stosszeit: false },
    },
    availability: emptyAvailability(),
  };
}

export function makeAvailability(entries: Partial<Record<WeekdayKey, [number, number]>>): Availability {
  const result = emptyAvailability();
  for (const key of weekdayKeys) {
    const entry = entries[key];
    if (entry) result[key] = { available: true, from: entry[0], to: entry[1] };
  }
  return result;
}

export function exceptionBlocks(kind: ExceptionKind): [number, number] {
  if (kind === "vormittags") return [0, NOON];
  if (kind === "nachmittags") return [NOON, 24 * 60];
  return [0, 24 * 60];
}

export function exceptionsOn(
  exceptions: readonly AvailabilityException[],
  employeeId: string,
  date: string,
): AvailabilityException[] {
  return exceptions.filter(
    (item) => item.employeeId === employeeId && item.startDate <= date && date <= item.endDate,
  );
}

export type AvailabilityCheck = { ok: true } | { ok: false; reason: string };

export function checkAvailability(
  availability: Availability | undefined,
  exceptions: readonly AvailabilityException[],
  employeeId: string,
  date: string,
  start: number,
  end: number,
): AvailabilityCheck {
  for (const item of exceptionsOn(exceptions, employeeId, date)) {
    const [from, to] = exceptionBlocks(item.kind);
    if (start < to && end > from) {
      return { ok: false, reason: `${exceptionLabels[item.kind]} (Ausnahme eingetragen)` };
    }
  }
  const day = availability?.[weekdayKeyOf(date)];
  if (!day || !day.available) return { ok: false, reason: "an diesem Wochentag nicht als verfügbar hinterlegt" };
  if (start < day.from || end > day.to) {
    return { ok: false, reason: `außerhalb der regelmäßigen Verfügbarkeit (${formatRange(day.from, day.to)})` };
  }
  return { ok: true };
}

export function normalizeAvailabilityDay(day: AvailabilityDay): AvailabilityDay {
  const from = Math.max(0, Math.min(23 * 60, day.from));
  const to = Math.max(from + 60, Math.min(24 * 60, day.to));
  return { available: day.available, from, to };
}

export function availabilityTileLabel(day: AvailabilityDay): [string, string] | null {
  if (!day.available) return null;
  return [formatTime(day.from), formatTime(day.to)];
}
