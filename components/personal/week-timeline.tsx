"use client"

import { useMemo, type CSSProperties, type ReactNode } from "react"
import { Cake, Cloud, CloudDrizzle, CloudRain, CloudSun, Flag, Luggage, School, Sun, type LucideIcon } from "lucide-react"

import { Block } from "@/components/ui/block"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  dayTimeline,
  formatRange,
  formatShortDate,
  formatWeekdayLong,
  formatWeekdayShort,
  timelineOffset,
  timelineSteps,
  weekAxis,
  type DayTimeline,
  type PlanDay,
  type PlanWeek,
  type Shift,
  roleLabels,
  type Role,
  type TimelineBooking,
  type WeatherSymbol,
  type WeekAxis,
} from "@/lib/personal"

import { usePersonal } from "./personal-context"

const weatherIcons: Record<WeatherSymbol, LucideIcon> = {
  sonne: Sun,
  wolken: Cloud,
  teilweise: CloudSun,
  regen: CloudRain,
  schauer: CloudDrizzle,
}

const BOOKING_LANE = 18
const SHIFT_LANE = 40

const roleLegend: { role: Role; label: string }[] = [
  { role: "leitung", label: "Leitung" },
  { role: "schichtleiter", label: "Schichtleiter" },
  { role: "mitarbeiter", label: "Mitarbeiter" },
  { role: "reinigungskraft", label: "Putzkraft" },
]

export function WeekTimeline({ week, shifts }: { week: PlanWeek; shifts: readonly Shift[] }) {
  const { state } = usePersonal()
  const axis = useMemo(() => weekAxis(week.days, shifts), [week, shifts])
  const columns = useMemo(
    () => week.days.map((day) => ({ day, timeline: dayTimeline(day, shifts, state.employees, state.rules) })),
    [week, shifts, state.employees, state.rules],
  )
  const bookingLanes = columns.reduce((max, column) => Math.max(max, column.timeline.bookingLanes), 0)
  const shiftLanes = columns.reduce((max, column) => Math.max(max, column.timeline.shiftLanes), 1)
  const columnWidth = Math.max(136, bookingLanes * BOOKING_LANE + shiftLanes * SHIFT_LANE + 8)

  return (
    <Block
      className="personal-timeline-block"
      title="Stundenplan"
      legend={
        <span className="personal-legend" aria-label="Legende">
          {roleLegend.map((item) => (
            <span key={item.role}>
              <span className="personal-timeline-swatch" data-role={item.role} aria-hidden="true" />
              {item.label}
            </span>
          ))}
          <span>
            <Cake size={14} strokeWidth={1.8} aria-hidden="true" />
            Geburtstag
          </span>
          <span>
            <School size={14} strokeWidth={1.8} aria-hidden="true" />
            Kita
          </span>
        </span>
      }
    >
      <TooltipProvider delayDuration={400}>
        <div className="personal-timeline" role="group" aria-label="Stundenplan der Woche">
          <div
            className="personal-timeline-sheet"
            style={{ ["--timeline-steps" as string]: String(timelineSteps(axis)), ["--timeline-column" as string]: `${columnWidth}px` }}
          >
            <div className="personal-timeline-axis" aria-hidden="true">
              <div className="personal-timeline-corner" />
              <div className="personal-timeline-plot">
                {axis.ticks.map((tick) =>
                  tick.label ? (
                    <span
                      key={tick.minute}
                      className="personal-timeline-tick"
                      data-edge={tick.minute === axis.start ? "start" : tick.minute === axis.end ? "end" : undefined}
                      style={{ top: `${timelineOffset(axis, tick.minute)}%` }}
                    >
                      {tick.label}
                    </span>
                  ) : null,
                )}
              </div>
            </div>
            {columns.map((column) => (
              <DayColumn key={column.day.date} day={column.day} timeline={column.timeline} axis={axis} />
            ))}
          </div>
        </div>
      </TooltipProvider>
    </Block>
  )
}

function DayColumn({ day, timeline, axis }: { day: PlanDay; timeline: DayTimeline; axis: WeekAxis }) {
  const Weather = weatherIcons[day.weather.symbol]
  const birthdays = day.bookings.filter((booking) => booking.kind === "geburtstag").length
  const kita = day.bookings.filter((booking) => booking.kind === "kita").length
  const shiftTrack = timeline.bookingLanes * BOOKING_LANE + (timeline.bookingLanes > 0 ? 6 : 2)

  return (
    <div className="personal-timeline-day" role="group" aria-label={dayLabel(day, birthdays, kita)}>
      <div className="personal-timeline-dayhead" aria-hidden="true">
        <span className="personal-day-identity">
          <span className="personal-day-name">{formatWeekdayShort(day.date)}</span>
          <span className="personal-day-date">{formatShortDate(day.date)}</span>
        </span>
        <span className="personal-day-weather">
          <Weather strokeWidth={1.8} aria-hidden="true" />
          <span className="personal-day-temp">{day.weather.temperature}°</span>
        </span>
        <span className="personal-day-bookings">
          <span className="personal-day-booking">
            <Cake strokeWidth={1.8} aria-hidden="true" />
            {birthdays}
          </span>
          <span className="personal-day-booking">
            <School strokeWidth={1.8} aria-hidden="true" />
            {kita}
          </span>
        </span>
        {day.ferien || day.holiday ? (
          <span className="personal-day-marks">
            {day.ferien ? <Luggage strokeWidth={1.8} aria-hidden="true" /> : null}
            {day.holiday ? <Flag strokeWidth={1.8} aria-hidden="true" /> : null}
          </span>
        ) : null}
      </div>
      <div className="personal-timeline-plot">
        {closedBands(axis, timeline.opening).map((band) => (
          <span key={`${band.top}-${band.height}`} className="personal-timeline-closed" style={{ top: `${band.top}%`, height: `${band.height}%` }} aria-hidden="true" />
        ))}
        {axis.ticks.map((tick) =>
          tick.minute === axis.start || tick.minute === axis.end ? null : (
            <span
              key={tick.minute}
              className="personal-timeline-line"
              data-hour={tick.label ? "true" : undefined}
              style={{ top: `${timelineOffset(axis, tick.minute)}%` }}
              aria-hidden="true"
            />
          ),
        )}
        <div className="personal-timeline-layer">
          {timeline.bookingLanes > 0 ? (
            <div className="personal-timeline-lane" style={{ left: 2, width: timeline.bookingLanes * BOOKING_LANE }}>
              {timeline.bookings.map((booking) => (
                <TimelineStroke key={booking.id} kind="booking" label={bookingLabel(booking)} style={laneStyle(axis, booking.start, booking.end, booking.lane, timeline.bookingLanes)}>
                  <span className="personal-timeline-icons" aria-hidden="true">
                    {booking.birthdays > 0 ? <Cake size={14} strokeWidth={1.8} /> : null}
                    {booking.kita > 0 ? <School size={14} strokeWidth={1.8} /> : null}
                  </span>
                  <span className="personal-timeline-stroke-line" aria-hidden="true" />
                </TimelineStroke>
              ))}
            </div>
          ) : null}
          {timeline.shiftLanes > 0 ? (
            <div className="personal-timeline-lane" style={{ left: shiftTrack, right: 2 }}>
              {timeline.shifts.map((shift) => (
                <TimelineStroke key={shift.id} kind="shift" role={shift.role} label={`${shift.name}, ${roleLabels[shift.role]}, ${formatRange(shift.start, shift.end)}`} style={laneStyle(axis, shift.start, shift.end, shift.lane, timeline.shiftLanes, 3)}>
                  <span className="personal-timeline-mark" aria-hidden="true">{shift.letter}</span>
                </TimelineStroke>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function TimelineStroke({ kind, role, label, style, children }: { kind: "booking" | "shift"; role?: Role; label: string; style: CSSProperties; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="personal-timeline-stroke" data-kind={kind} data-role={role} style={style} aria-label={label}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="personal-timeline-tip" side="top" sideOffset={8}>{label}</TooltipContent>
    </Tooltip>
  )
}

function laneStyle(axis: WeekAxis, start: number, end: number, lane: number, lanes: number, inset = 0): CSSProperties {
  const top = timelineOffset(axis, start)
  const share = 100 / lanes
  const origin = (lane / lanes) * 100
  return {
    top: `${top}%`,
    height: `${timelineOffset(axis, end) - top}%`,
    left: inset ? `calc(${origin}% + ${inset}px)` : `${origin}%`,
    width: inset ? `calc(${share}% - ${inset * 2}px)` : `${share}%`,
  }
}

function closedBands(axis: WeekAxis, opening: { start: number; end: number } | null): { top: number; height: number }[] {
  if (!opening) return [{ top: 0, height: 100 }]
  const openTop = timelineOffset(axis, Math.max(opening.start, axis.start))
  const openBottom = timelineOffset(axis, Math.min(opening.end, axis.end))
  const bands: { top: number; height: number }[] = []
  if (openTop > 0) bands.push({ top: 0, height: openTop })
  if (openBottom < 100) bands.push({ top: openBottom, height: 100 - openBottom })
  return bands
}

function countPhrase(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function dayLabel(day: PlanDay, birthdays: number, kita: number): string {
  const notes = [day.ferien ? "Ferien" : null, day.holiday ?? null].filter(Boolean)
  const label = `${formatWeekdayLong(day.date)}, ${formatShortDate(day.date)}, ${day.weather.temperature} Grad, ${countPhrase(birthdays, "Geburtstag", "Geburtstage")}, ${countPhrase(kita, "Kita-Besuch", "Kita-Besuche")}`
  return notes.length > 0 ? `${label}, ${notes.join(", ")}` : label
}

function bookingLabel(booking: TimelineBooking): string {
  const kind = booking.birthdays > 0 && booking.kita > 0 ? "Geburtstag und Kita" : booking.kita > 0 ? "Kita" : "Geburtstag"
  const names = booking.names.join(", ")
  const range = formatRange(booking.start, booking.end)
  return names ? `${kind}, ${range}, ${names}` : `${kind}, ${range}`
}
