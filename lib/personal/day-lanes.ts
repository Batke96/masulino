import { checkAvailability } from "./availability"
import { openingOf } from "./rules"
import type { Availability, AvailabilityException, Employee, PlanDay, Role, Rules, Shift, ShiftKind } from "./types"

export type ShiftLane = "schichtleiter" | "mitarbeiter" | "putzkraft"

export type ShiftBar = {
  employeeId: string
  start: number
  end: number
  shifts: Shift[]
  primary: Shift
}

export type DayRoster = {
  lead: ShiftBar | null
  staff: ShiftBar[]
  cleaning: ShiftBar[]
  people: number
  minutes: number
  proposal: boolean
}

const laneRoleSets: Record<ShiftLane, readonly Role[]> = {
  schichtleiter: ["leitung", "schichtleiter"],
  mitarbeiter: ["leitung", "schichtleiter", "mitarbeiter"],
  putzkraft: ["reinigungskraft"],
}

export function laneRoles(lane: ShiftLane): readonly Role[] {
  return laneRoleSets[lane]
}

export function laneKind(lane: ShiftLane): ShiftKind {
  return lane === "putzkraft" ? "cleaning" : "service"
}

function roleOf(employees: readonly Employee[], id: string): Role {
  return employees.find((item) => item.id === id)?.role ?? "mitarbeiter"
}

function longest(shifts: readonly Shift[]): Shift {
  return [...shifts].sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start || a.id.localeCompare(b.id))[0]!
}

function barsFor(shifts: readonly Shift[]): ShiftBar[] {
  const groups = new Map<string, Shift[]>()
  for (const shift of shifts) groups.set(shift.employeeId, [...(groups.get(shift.employeeId) ?? []), shift])
  return [...groups.entries()]
    .map(([employeeId, items]) => {
      const ordered = [...items].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id))
      return {
        employeeId,
        start: ordered[0]!.start,
        end: ordered[ordered.length - 1]!.end,
        shifts: ordered,
        primary: longest(ordered),
      }
    })
    .sort((a, b) => a.start - b.start || a.employeeId.localeCompare(b.employeeId))
}

function coversOpening(bar: ShiftBar, openingStart: number): boolean {
  return bar.shifts.some((shift) => shift.start <= openingStart && openingStart < shift.end)
}

export function preferredEmployee(
  employees: readonly Employee[],
  availability: Readonly<Record<string, Availability>>,
  exceptions: readonly AvailabilityException[],
  lane: ShiftLane,
  date: string,
  start: number,
  end: number,
): string | null {
  const roles = new Set(laneRoles(lane))
  const ranked = employees
    .filter((item) => roles.has(item.role))
    .sort((a, b) => {
      const aFit = checkAvailability(availability[a.id], exceptions, a.id, date, start, end).ok ? 0 : 1
      const bFit = checkAvailability(availability[b.id], exceptions, b.id, date, start, end).ok ? 0 : 1
      return aFit - bFit || a.name.localeCompare(b.name, "de")
    })
  return ranked[0]?.id ?? null
}

export function staffDay(day: PlanDay, shifts: readonly Shift[], employees: readonly Employee[], _rules: Rules): DayRoster {
  const mine = shifts.filter((shift) => shift.date === day.date)
  const cleaners = mine.filter((shift) => roleOf(employees, shift.employeeId) === "reinigungskraft")
  const service = mine.filter((shift) => roleOf(employees, shift.employeeId) !== "reinigungskraft" && shift.kind === "service")
  const other = mine.filter((shift) => roleOf(employees, shift.employeeId) !== "reinigungskraft" && shift.kind === "cleaning")
  const candidates = barsFor(service.filter((shift) => {
    const role = roleOf(employees, shift.employeeId)
    return role === "leitung" || role === "schichtleiter"
  }))
  const span = openingOf(day.date)
  const ordered = [...candidates].sort((a, b) => {
    const aCover = span && coversOpening(a, span.start) ? 0 : 1
    const bCover = span && coversOpening(b, span.start) ? 0 : 1
    return aCover - bCover || a.start - b.start || a.employeeId.localeCompare(b.employeeId)
  })
  const lead = ordered[0] ?? null
  const leadIds = new Set(lead?.shifts.map((shift) => shift.id) ?? [])
  const staff = barsFor([...service.filter((shift) => !leadIds.has(shift.id)), ...other])
  const cleaning = barsFor(cleaners)
  const people = new Set([
    ...(lead ? [lead.employeeId] : []),
    ...staff.map((item) => item.employeeId),
    ...cleaning.map((item) => item.employeeId),
  ])
  return {
    lead,
    staff,
    cleaning,
    people: people.size,
    minutes: mine.reduce((sum, shift) => sum + shift.end - shift.start, 0),
    proposal: mine.some((shift) => shift.origin === "vorschlag"),
  }
}
