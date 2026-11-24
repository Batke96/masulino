import { bookingWindows } from "./plan"
import { openingOf } from "./rules"
import { formatTime } from "./time"
import type { PlanDay, Role, Rules, Shift } from "./types"

export const TIMELINE_STEP = 30

const FALLBACK_START = 10 * 60
const FALLBACK_END = 19 * 60

export type TimelineTick = {
  minute: number
  label: string | null
}

export type WeekAxis = {
  start: number
  end: number
  ticks: TimelineTick[]
}

export type TimelineBooking = {
  id: string
  start: number
  end: number
  birthdays: number
  kita: number
  names: string[]
  lane: number
}

export type TimelineShift = {
  id: string
  employeeId: string
  name: string
  role: Role
  letter: string
  start: number
  end: number
  lane: number
}

export type DayTimeline = {
  opening: { start: number; end: number } | null
  bookings: TimelineBooking[]
  bookingLanes: number
  shifts: TimelineShift[]
  shiftLanes: number
}

type Span = { start: number; end: number }

function snapDown(minute: number): number {
  return Math.floor(minute / TIMELINE_STEP) * TIMELINE_STEP
}

function snapUp(minute: number): number {
  return Math.ceil(minute / TIMELINE_STEP) * TIMELINE_STEP
}

export function markLetter(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const head = parts[0]?.toLocaleLowerCase("de-DE")
  const source = head === "mitarbeiter" && parts[1] ? parts[1] : parts[0]
  const letter = source?.[0]
  return letter ? letter.toLocaleUpperCase("de-DE") : "?"
}

export function weekAxis(days: readonly PlanDay[], shifts: readonly Shift[]): WeekAxis {
  const dates = new Set(days.map((day) => day.date))
  const points: number[] = []
  for (const day of days) {
    const opening = openingOf(day.date)
    if (opening) points.push(opening.start, opening.end)
    for (const booking of day.bookings) points.push(booking.start, booking.end)
  }
  for (const shift of shifts) {
    if (!dates.has(shift.date) || shift.end <= shift.start) continue
    points.push(shift.start, shift.end)
  }
  let start = points.length > 0 ? snapDown(Math.min(...points)) : FALLBACK_START
  let end = points.length > 0 ? snapUp(Math.max(...points)) : FALLBACK_END
  if (end <= start) end = start + TIMELINE_STEP
  const ticks: TimelineTick[] = []
  for (let minute = start; minute <= end; minute += TIMELINE_STEP) {
    ticks.push({ minute, label: minute % 60 === 0 ? formatTime(minute) : null })
  }
  return { start, end, ticks }
}

export function timelineSteps(axis: WeekAxis): number {
  return Math.max(1, (axis.end - axis.start) / TIMELINE_STEP)
}

export function timelineOffset(axis: WeekAxis, minute: number): number {
  const span = axis.end - axis.start
  if (span <= 0) return 0
  return ((minute - axis.start) / span) * 100
}

function assignLanes<T extends Span>(items: readonly T[]): Array<T & { lane: number }> {
  const laneEnds: number[] = []
  return items.map((item) => {
    const open = laneEnds.findIndex((end) => end <= item.start)
    const lane = open === -1 ? laneEnds.length : open
    laneEnds[lane] = item.end
    return { ...item, lane }
  })
}

function laneCount(lanes: readonly number[]): number {
  return lanes.reduce((max, lane) => Math.max(max, lane + 1), 0)
}

function shiftSpans(
  shifts: readonly Shift[],
  people: ReadonlyMap<string, { name: string; role: Role }>,
): Omit<TimelineShift, "lane">[] {
  const groups = new Map<string, Shift[]>()
  for (const shift of shifts) {
    if (shift.end <= shift.start) continue
    groups.set(shift.employeeId, [...(groups.get(shift.employeeId) ?? []), shift])
  }
  const spans: Omit<TimelineShift, "lane">[] = []
  for (const [employeeId, items] of groups) {
    const ordered = [...items].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id))
    const person = people.get(employeeId)
    const name = person?.name ?? "Unbekannt"
    const role = person?.role ?? "mitarbeiter"
    const letter = markLetter(name)
    let current = { start: ordered[0]!.start, end: ordered[0]!.end, ids: [ordered[0]!.id] }
    const push = () => {
      spans.push({
        id: current.ids.join("-"),
        employeeId,
        name,
        role,
        letter,
        start: current.start,
        end: current.end,
      })
    }
    for (const shift of ordered.slice(1)) {
      if (shift.start <= current.end) {
        current.end = Math.max(current.end, shift.end)
        current.ids.push(shift.id)
      } else {
        push()
        current = { start: shift.start, end: shift.end, ids: [shift.id] }
      }
    }
    push()
  }
  return spans.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name, "de") || a.end - b.end || a.id.localeCompare(b.id))
}

export function dayTimeline(
  day: PlanDay,
  shifts: readonly Shift[],
  employees: readonly { id: string; name: string; role?: Role }[],
  rules: Rules,
): DayTimeline {
  const people = new Map(employees.map((employee) => [employee.id, { name: employee.name, role: employee.role ?? "mitarbeiter" }]))
  const bookings = assignLanes(
    bookingWindows(day, shifts, rules)
      .filter((window) => window.end > window.start)
      .map((window) => ({
        id: window.key,
        start: window.start,
        end: window.end,
        birthdays: window.birthdays,
        kita: window.kita,
        names: window.bookings.map((booking) => booking.name),
      })),
  )
  const placed = assignLanes(shiftSpans(shifts.filter((shift) => shift.date === day.date), people))
  return {
    opening: openingOf(day.date),
    bookings,
    bookingLanes: laneCount(bookings.map((item) => item.lane)),
    shifts: placed,
    shiftLanes: laneCount(placed.map((item) => item.lane)),
  }
}
