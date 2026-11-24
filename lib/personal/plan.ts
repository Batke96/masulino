import { checkAvailability } from "./availability";
import {
  dayKeyFor,
  expectedGuestsAt,
  leadRoleRank,
  openingOf,
  requiredHeadcount,
  roleRank,
  weekdayKeyOf,
} from "./rules";
import {
  SLICE_MINUTES,
  durationLabel,
  formatDayHeading,
  formatRange,
  formatShortDate,
  formatTime,
  formatWeekdayLong,
  hoursLabel,
} from "./time";
import type {
  DayKey,
  Employee,
  PersonalState,
  PlanBooking,
  PlanDay,
  PlanIssue,
  PlanWeek,
  Rules,
  Shift,
} from "./types";

const MAX_SHIFT = 9 * 60;
const MIN_SHIFT = 2 * 60;
const SPECIAL_MIN = 1;

export type SpecialOpening = {
  booking: PlanBooking;
  openAt: number;
  coverFrom: number;
};

export function specialOpeningOf(day: PlanDay, rules: Pick<Rules, "autoSpecialOpenings" | "specialOpeningLead">): SpecialOpening | null {
  if (!rules.autoSpecialOpenings) return null;
  const opening = openingOf(day.date);
  if (!opening) return null;
  const early = day.bookings
    .filter((booking) => booking.kind === "kita" && booking.start < opening.start)
    .sort((a, b) => a.start - b.start)[0];
  if (!early) return null;
  return { booking: early, openAt: early.start, coverFrom: Math.max(0, early.start - rules.specialOpeningLead) };
}

/** First minute someone must be present: the lead before the effective opening. */
export function coverFromOf(day: PlanDay, rules: Pick<Rules, "autoSpecialOpenings" | "specialOpeningLead">): number | null {
  const opening = openingOf(day.date);
  if (!opening) return null;
  const special = specialOpeningOf(day, rules);
  const openAt = special ? special.openAt : opening.start;
  return Math.max(0, openAt - Math.max(0, rules.specialOpeningLead));
}

function availabilityCheckStart(day: PlanDay, rules: Pick<Rules, "autoSpecialOpenings" | "specialOpeningLead">, start: number): number {
  const opening = openingOf(day.date);
  const coverFrom = coverFromOf(day, rules);
  if (!opening || coverFrom === null) return start;
  const openAt = specialOpeningOf(day, rules)?.openAt ?? opening.start;
  if (start >= coverFrom && start < openAt) return openAt;
  return start;
}

export type Slice = {
  start: number;
  required: number;
  needKasse: boolean;
  special: boolean;
  guests: number;
};

export function daySlices(day: PlanDay, rules: Rules): Slice[] {
  const opening = openingOf(day.date);
  if (!opening) return [];
  const key = dayKeyFor(day, rules);
  const rule = rules.days[key];
  const from = coverFromOf(day, rules) ?? opening.start;
  const slices: Slice[] = [];
  for (let start = from; start < opening.end; start += SLICE_MINUTES) {
    const regular = start >= opening.start;
    const guests = expectedGuestsAt(day, key, start);
    slices.push({
      start,
      required: regular ? requiredHeadcount(rules, key, guests, start).capped : SPECIAL_MIN,
      needKasse: rule.requireKasse,
      special: !regular,
      guests,
    });
  }
  return slices;
}

export function shiftsOn(shifts: readonly Shift[], date: string): Shift[] {
  return shifts
    .filter((shift) => shift.date === date)
    .sort((a, b) => a.start - b.start || a.end - b.end || a.employeeId.localeCompare(b.employeeId));
}

function covering(shifts: readonly Shift[], minute: number): Shift[] {
  return shifts.filter((shift) => shift.kind === "service" && shift.start <= minute && minute < shift.end);
}

function employeeName(employees: readonly Employee[], id: string): string {
  return employees.find((item) => item.id === id)?.name ?? "Unbekannt";
}

function intervals(starts: number[]): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (const start of starts) {
    const last = result[result.length - 1];
    if (last && last[1] === start) last[1] = start + SLICE_MINUTES;
    else result.push([start, start + SLICE_MINUTES]);
  }
  return result;
}

function dayLabel(date: string): string {
  return `${formatWeekdayLong(date)}, ${formatShortDate(date)}`;
}

export function employeeMinutes(shifts: readonly Shift[], employeeId: string): number {
  return shifts.filter((shift) => shift.employeeId === employeeId).reduce((sum, shift) => sum + (shift.end - shift.start), 0);
}

export function evaluateWeek(week: PlanWeek, shifts: readonly Shift[], state: Pick<PersonalState, "employees" | "availability" | "exceptions" | "rules">): PlanIssue[] {
  const { employees, availability, exceptions, rules } = state;
  const issues: PlanIssue[] = [];

  for (const day of week.days) {
    const key = dayKeyFor(day, rules);
    const rule = rules.days[key];
    const dayShifts = shiftsOn(shifts, day.date);
    const service = dayShifts.filter((shift) => shift.kind === "service");
    const slices = daySlices(day, rules);
    const special = specialOpeningOf(day, rules);
    const opening = openingOf(day.date);

    if (service.length === 0 && opening) {
      issues.push({
        id: `keine-schichten:${day.date}`,
        severity: "blocker",
        date: day.date,
        code: "keine-schichten",
        message: `${dayLabel(day.date)}: Es sind keine Schichten eingeteilt.`,
        fix: { type: "addShift", date: day.date, start: coverFromOf(day, rules) ?? opening.start, end: opening.end },
      });
    } else {
      const under: number[] = [];
      const specialUnder: number[] = [];
      const noKasse: number[] = [];
      const over: number[] = [];
      for (const slice of slices) {
        const present = covering(service, slice.start);
        const people = new Set(present.map((shift) => shift.employeeId));
        if (people.size < slice.required) (slice.special ? specialUnder : under).push(slice.start);
        if (people.size > rule.max) over.push(slice.start);
        if (slice.needKasse && !slice.special) {
          const hasKasse = [...people].some((id) => employees.find((item) => item.id === id)?.skills.kasse);
          if (!hasKasse) noKasse.push(slice.start);
        }
      }

      if (special && specialUnder.length > 0) {
        const opensAt = formatTime(special.openAt);
        issues.push({
          id: `sonderoeffnung:${day.date}`,
          severity: "blocker",
          date: day.date,
          code: "sonderoeffnung",
          message: `${dayLabel(day.date)}: Die Kita-Sonderöffnung um ${opensAt} Uhr benötigt eine Frühschicht ab ${formatTime(special.coverFrom)} Uhr.`,
          fix: {
            type: "addShift",
            date: day.date,
            start: special.coverFrom,
            end: Math.max(special.booking.end, (opening?.start ?? special.booking.end) + 60),
          },
        });
      } else if (!special && opening && specialUnder.length > 0) {
        const coverFrom = coverFromOf(day, rules) ?? opening.start;
        issues.push({
          id: `vorlauf:${day.date}`,
          severity: "blocker",
          date: day.date,
          code: "vorlauf",
          message: `${dayLabel(day.date)}: Vor der Öffnung um ${formatTime(opening.start)} Uhr muss ab ${formatTime(coverFrom)} Uhr jemand eingeteilt sein.`,
          fix: { type: "addShift", date: day.date, start: coverFrom, end: Math.min(opening.end, coverFrom + MIN_SHIFT) },
        });
      }

      for (const [from, to] of intervals(under)) {
        const members = slices.filter((slice) => slice.start >= from && slice.start < to);
        const required = Math.max(...members.map((slice) => slice.required));
        const present = Math.min(...members.map((slice) => new Set(covering(service, slice.start).map((shift) => shift.employeeId)).size));
        issues.push({
          id: `unterbesetzt:${day.date}:${from}`,
          severity: "blocker",
          date: day.date,
          code: "unterbesetzt",
          message: `${dayLabel(day.date)}: ${formatRange(from, to)} Uhr sind ${present} von ${required} Personen eingeteilt.`,
          fix: { type: "addShift", date: day.date, start: from, end: to },
        });
      }

      for (const [from, to] of intervals(noKasse)) {
        issues.push({
          id: `kasse:${day.date}:${from}`,
          severity: "blocker",
          date: day.date,
          code: "kasse",
          message: `${dayLabel(day.date)}: ${formatRange(from, to)} Uhr ist die Kasse nicht abgedeckt.`,
          fix: { type: "addShift", date: day.date, start: from, end: to },
        });
      }

      for (const [from, to] of intervals(over)) {
        issues.push({
          id: `ueberbesetzt:${day.date}:${from}`,
          severity: "hinweis",
          date: day.date,
          code: "ueberbesetzt",
          message: `${dayLabel(day.date)}: ${formatRange(from, to)} Uhr sind mehr als ${rule.max} Personen eingeteilt.`,
        });
      }

      if (rule.leadRole !== "none") {
        const needed = leadRoleRank(rule.leadRole);
        const hasLead = service.some((shift) => roleRank(employees.find((item) => item.id === shift.employeeId)?.role ?? "") >= needed);
        if (!hasLead) {
          issues.push({
            id: `leitung:${day.date}`,
            severity: "blocker",
            date: day.date,
            code: "leitung",
            message: `${dayLabel(day.date)}: Es ist keine ${rule.leadRole === "leitung" ? "Leitung" : "Schichtleitung"} eingeteilt.`,
          });
        }
      }

      if (rule.requireReinigung) {
        const hasCleaner = dayShifts.some((shift) => employees.find((item) => item.id === shift.employeeId)?.skills.reinigung);
        if (!hasCleaner) {
          issues.push({
            id: `reinigung:${day.date}`,
            severity: "blocker",
            date: day.date,
            code: "reinigung",
            message: `${dayLabel(day.date)}: Niemand mit Toilettenreinigung ist eingeteilt.`,
          });
        }
      }
    }

    const weekdayKey = weekdayKeyOf(day.date);
    for (const service of rules.cleaning) {
      if (!service.enabled || !service.days.includes(weekdayKey)) continue;
      const done = dayShifts.some((shift) => shift.kind === "cleaning" && shift.start <= service.start && shift.end >= service.end);
      if (!done) {
        issues.push({
          id: `reinigungsdienst:${day.date}:${service.id}`,
          severity: "hinweis",
          date: day.date,
          code: "reinigungsdienst",
          message: `${dayLabel(day.date)}: ${service.label} (${formatRange(service.start, service.end)} Uhr) ist niemandem zugeteilt.`,
          fix: { type: "addShift", date: day.date, start: service.start, end: service.end },
        });
      }
    }

    for (let i = 0; i < dayShifts.length; i += 1) {
      for (let j = i + 1; j < dayShifts.length; j += 1) {
        const a = dayShifts[i]!;
        const b = dayShifts[j]!;
        if (a.employeeId === b.employeeId && a.start < b.end && b.start < a.end) {
          issues.push({
            id: `ueberschneidung:${a.id}:${b.id}`,
            severity: "blocker",
            date: day.date,
            code: "ueberschneidung",
            message: `${dayLabel(day.date)}: ${employeeName(employees, a.employeeId)} hat zwei sich überschneidende Schichten.`,
          });
        }
      }
    }

    for (const shift of dayShifts) {
      const check = checkAvailability(availability[shift.employeeId], exceptions, shift.employeeId, shift.date, availabilityCheckStart(day, rules, shift.start), shift.end);
      if (!check.ok) {
        issues.push({
          id: `verfuegbarkeit:${shift.id}`,
          severity: "hinweis",
          date: day.date,
          code: "verfuegbarkeit",
          message: `${employeeName(employees, shift.employeeId)}, ${formatDayHeading(shift.date)} ${formatRange(shift.start, shift.end)} Uhr: ${check.reason}.`,
          fix: { type: "openAvailability", employeeId: shift.employeeId },
        });
      }
    }
  }

  for (const employee of employees) {
    const minutes = employeeMinutes(shifts, employee.id);
    if (minutes > employee.maxHours * 60) {
      issues.push({
        id: `stunden:${employee.id}`,
        severity: "hinweis",
        date: week.start,
        code: "stunden",
        message: `${employee.name}: ${hoursLabel(minutes)} geplant, die Obergrenze liegt bei ${employee.maxHours} Std.`,
        fix: { type: "openAvailability", employeeId: employee.id },
      });
    }
  }

  return issues.sort((a, b) => a.date.localeCompare(b.date) || (a.severity === b.severity ? 0 : a.severity === "blocker" ? -1 : 1));
}

export type WeekStats = {
  birthdays: number;
  kitaVisits: number;
  shifts: number;
  minutes: number;
  specialOpenings: number;
};

export function weekStats(week: PlanWeek, shifts: readonly Shift[], rules: Rules): WeekStats {
  let birthdays = 0;
  let kitaVisits = 0;
  let specialOpenings = 0;
  for (const day of week.days) {
    for (const booking of day.bookings) {
      if (booking.kind === "geburtstag") birthdays += 1;
      else kitaVisits += 1;
    }
    if (specialOpeningOf(day, rules)) specialOpenings += 1;
  }
  return {
    birthdays,
    kitaVisits,
    shifts: shifts.length,
    minutes: shifts.reduce((sum, shift) => sum + (shift.end - shift.start), 0),
    specialOpenings,
  };
}

export type BookingWindow = {
  key: string;
  start: number;
  end: number;
  bookings: PlanBooking[];
  birthdays: number;
  kita: number;
  persons: number;
  children: number;
  adults: number;
  overlapStaff: number;
  required: number;
  short: boolean;
};

export function bookingWindows(day: PlanDay, shifts: readonly Shift[], rules: Rules): BookingWindow[] {
  const groups = new Map<string, PlanBooking[]>();
  for (const booking of day.bookings) {
    const key = `${booking.start}-${booking.end}`;
    groups.set(key, [...(groups.get(key) ?? []), booking]);
  }
  const service = shiftsOn(shifts, day.date).filter((shift) => shift.kind === "service");
  const slices = daySlices(day, rules);
  return [...groups.entries()]
    .map(([key, bookings]) => {
      const first = bookings[0]!;
      const people = new Set(service.filter((shift) => shift.start < first.end && first.start < shift.end).map((shift) => shift.employeeId));
      const members = slices.filter((slice) => slice.start >= first.start && slice.start < first.end);
      const required = members.length ? Math.max(...members.map((slice) => slice.required)) : 0;
      const lowest = members.length
        ? Math.min(...members.map((slice) => new Set(covering(service, slice.start).map((shift) => shift.employeeId)).size))
        : 0;
      return {
        key,
        start: first.start,
        end: first.end,
        bookings,
        birthdays: bookings.filter((item) => item.kind === "geburtstag").length,
        kita: bookings.filter((item) => item.kind === "kita").length,
        persons: bookings.reduce((sum, item) => sum + item.children + item.adults, 0),
        children: bookings.reduce((sum, item) => sum + item.children, 0),
        adults: bookings.reduce((sum, item) => sum + item.adults, 0),
        overlapStaff: people.size,
        required,
        short: lowest < required,
      };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

export function dayPersons(day: PlanDay): number {
  return day.bookings.reduce((sum, booking) => sum + booking.children + booking.adults, 0);
}

export function peakGuests(day: PlanDay, key: DayKey): number {
  const opening = openingOf(day.date);
  if (!opening) return 0;
  let peak = 0;
  for (let minute = opening.start; minute < opening.end; minute += SLICE_MINUTES) {
    peak = Math.max(peak, expectedGuestsAt(day, key, minute));
  }
  return peak;
}

export type Proposal = {
  shifts: Shift[];
  added: Shift[];
  removed: Shift[];
};

function priorityScore(employee: Employee): number {
  return employee.priority === "bevorzugt" ? 30 : employee.priority === "standard" ? 20 : 10;
}

export function proposeWeek(
  week: PlanWeek,
  existing: readonly Shift[],
  state: Pick<PersonalState, "employees" | "availability" | "exceptions" | "rules">,
  mode: "fill" | "rebuild",
): Proposal {
  const { employees, availability, exceptions, rules } = state;
  const kept: Shift[] = mode === "fill" ? [...existing] : [];
  const created: Shift[] = [];
  const all = () => [...kept, ...created];
  let counter = 0;
  const makeShift = (employeeId: string, date: string, start: number, end: number, kind: Shift["kind"]): Shift => {
    counter += 1;
    return {
      id: `vorschlag-${week.id}-${date}-${counter}`,
      employeeId,
      date,
      start,
      end,
      kind,
      origin: kind === "cleaning" ? "reinigung" : "vorschlag",
    };
  };

  const canWork = (employee: Employee, date: string, start: number, end: number, availabilityStart = start): boolean => {
    if (!checkAvailability(availability[employee.id], exceptions, employee.id, date, availabilityStart, end).ok) return false;
    const clash = all().some((shift) => shift.employeeId === employee.id && shift.date === date && shift.start < end && start < shift.end);
    if (clash) return false;
    return employeeMinutes(all(), employee.id) + (end - start) <= employee.maxHours * 60;
  };

  const loads = week.days.map((day) => ({
    day,
    load: daySlices(day, rules).reduce((sum, slice) => sum + slice.required, 0),
  }));
  const ordered = [...loads].sort((a, b) => b.load - a.load || a.day.date.localeCompare(b.day.date));

  for (const { day } of ordered) {
    const key = dayKeyFor(day, rules);
    const rule = rules.days[key];
    const weekdayKey = weekdayKeyOf(day.date);
    const slices = daySlices(day, rules);

    for (const service of rules.cleaning) {
      if (!service.enabled || !service.days.includes(weekdayKey)) continue;
      const done = shiftsOn(all(), day.date).some((shift) => shift.kind === "cleaning" && shift.start <= service.start && shift.end >= service.end);
      if (done) continue;
      const candidates = employees
        .filter((employee) => employee.skills.reinigung && canWork(employee, day.date, service.start, service.end))
        .sort((a, b) => Number(b.role === "reinigungskraft") - Number(a.role === "reinigungskraft") || priorityScore(b) - priorityScore(a) || a.id.localeCompare(b.id));
      const pick = candidates[0];
      if (pick) created.push(makeShift(pick.id, day.date, service.start, service.end, "cleaning"));
    }

    const unfillable = new Set<number>();
    for (let guard = 0; guard < 80; guard += 1) {
      const service = shiftsOn(all(), day.date).filter((shift) => shift.kind === "service");
      const deficient = (slice: Slice): boolean => {
        const people = new Set(covering(service, slice.start).map((shift) => shift.employeeId));
        if (people.size < slice.required) return true;
        if (slice.needKasse && !slice.special) {
          return ![...people].some((id) => employees.find((item) => item.id === id)?.skills.kasse);
        }
        return false;
      };
      const first = slices.find((slice) => !unfillable.has(slice.start) && deficient(slice));
      if (!first) break;

      let runEnd = first.start + SLICE_MINUTES;
      for (const slice of slices) {
        if (slice.start === runEnd && !unfillable.has(slice.start) && deficient(slice)) runEnd += SLICE_MINUTES;
      }

      const people = new Set(covering(service, first.start).map((shift) => shift.employeeId));
      const kasseCovered = [...people].some((id) => employees.find((item) => item.id === id)?.skills.kasse);
      const needKasse = first.needKasse && !first.special && !kasseCovered;
      const hasLead = rule.leadRole === "none" || service.some((shift) => roleRank(employees.find((item) => item.id === shift.employeeId)?.role ?? "") >= leadRoleRank(rule.leadRole));
      const hasCleaner = !rule.requireReinigung || shiftsOn(all(), day.date).some((shift) => employees.find((item) => item.id === shift.employeeId)?.skills.reinigung);

      type Candidate = { employee: Employee; end: number; score: number };
      const candidates: Candidate[] = [];
      for (const employee of employees) {
        if (employee.role === "reinigungskraft" || people.has(employee.id)) continue;
        if (needKasse && !employee.skills.kasse) continue;
        const readyAt = availabilityCheckStart(day, rules, first.start);
        if (!canWork(employee, day.date, first.start, first.start + SLICE_MINUTES, readyAt)) continue;
        const closing = openingOf(day.date)?.end ?? first.start + MAX_SHIFT;
        let end = Math.min(Math.max(runEnd, first.start + MIN_SHIFT), closing, first.start + MAX_SHIFT);
        while (end > first.start + SLICE_MINUTES && !canWork(employee, day.date, first.start, end, readyAt)) end -= SLICE_MINUTES;
        const used = employeeMinutes(all(), employee.id);
        let score = priorityScore(employee) * 10;
        score += Math.round((employee.targetHours * 60 - used) / 6);
        if (!hasLead && roleRank(employee.role) >= leadRoleRank(rule.leadRole)) score += 400;
        if (!hasCleaner && employee.skills.reinigung) score += 150;
        if (first.special && employee.skills.oeffnung) score += 300;
        if (!first.special && first.required > rule.min && employee.skills.stosszeit) score += 120;
        score += Math.min(end - first.start, runEnd - first.start) / 3;
        candidates.push({ employee, end, score });
      }
      candidates.sort((a, b) => b.score - a.score || a.employee.id.localeCompare(b.employee.id));
      const pick = candidates[0];
      if (!pick) {
        unfillable.add(first.start);
        continue;
      }
      created.push(makeShift(pick.employee.id, day.date, first.start, pick.end, "service"));
    }
  }

  const removed = mode === "rebuild" ? [...existing] : [];
  const merged = all().sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start || a.employeeId.localeCompare(b.employeeId));
  return { shifts: merged, added: created, removed };
}

export function shiftLabel(shift: Shift): string {
  return `${formatRange(shift.start, shift.end)} · ${durationLabel(shift.end - shift.start)}`;
}
