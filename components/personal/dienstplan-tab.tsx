"use client"

import { useMemo, useState, type ReactNode } from "react"
import {
  Baby,
  Cake,
  CircleAlert,
  Cloud,
  CloudDrizzle,
  CloudRain,
  CloudSun,
  Flag,
  Info,
  Luggage,
  School,
  Sun,
  User,
  Users,
  type LucideIcon,
} from "lucide-react"

import { Block } from "@/components/ui/block"
import { ActionButton, RowAction } from "@/components/ui/row-action"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  bookingWindows,
  checkAvailability,
  laneKind,
  openingOf,
  preferredEmployee,
  staffDay,
  weekdayKeyOf,
  dayKeyFor,
  durationLabel,
  evaluateWeek,
  formatRange,
  formatShortDate,
  formatWeekdayLong,
  formatWeekdayShort,
  hoursLabel,
  roleLabels,
  specialOpeningOf,
  formatTime,
  type PlanDay,
  type PlanIssue,
  type Shift,
  type ShiftLane,
  type WeatherSymbol,
} from "@/lib/personal"
import { usePersonal } from "./personal-context"
import { PersonAvatar, Pill } from "./personal-ui"
import { ProposalDialog } from "./plan-dialogs"
import { ShiftDialog, type ShiftDraft } from "./shift-dialog"
import { WeekTimeline } from "./week-timeline"

const weatherIcons: Record<WeatherSymbol, LucideIcon> = {
  sonne: Sun,
  wolken: Cloud,
  teilweise: CloudSun,
  regen: CloudRain,
  schauer: CloudDrizzle,
}

export function DienstplanTab() {
  const { state, week, weekId, date, setDate, commit } = usePersonal()
  const plan = state.plans[weekId] ?? { shifts: [], status: "entwurf" as const }
  const issues = useMemo(() => evaluateWeek(week, plan.shifts, state), [week, plan.shifts, state])
  const day = week.days.find((item) => item.date === date) ?? week.days[0]!
  const [shiftDraft, setShiftDraft] = useState<ShiftDraft | null>(null)
  const [proposalOpen, setProposalOpen] = useState(false)
  const employeeName = (id: string) => state.employees.find((item) => item.id === id)?.name ?? "Unbekannt"

  function saveShift(shift: ShiftDraft & { employeeId: string }) {
    const isNew = !shift.id
    commit(
      { type: "saveShift", weekId, shift: { id: shift.id, employeeId: shift.employeeId, date: shift.date, start: shift.start, end: shift.end, kind: shift.kind } },
      isNew ? "Schicht hinzugefügt" : "Schicht aktualisiert",
      { description: `${employeeName(shift.employeeId)} · ${formatShortDate(shift.date)} ${formatRange(shift.start, shift.end)}` },
    )
    setDate(shift.date)
    setShiftDraft(null)
  }

  function removeShift(shift: Shift) {
    commit({ type: "removeShift", weekId, id: shift.id }, "Schicht entfernt", {
      description: `${employeeName(shift.employeeId)} · ${formatShortDate(shift.date)} ${formatRange(shift.start, shift.end)}`,
    })
    setShiftDraft(null)
  }

  return (
    <div className="personal-tab">
      <Block
        className="personal-week-block"
        title="Wochenübersicht"
        legend={
          <span className="personal-legend" aria-label="Legende">
            <span><span className="personal-legend-swatch" data-state="ok" aria-hidden="true" />In Ordnung</span>
            <span><span className="personal-legend-swatch" data-state="offen" aria-hidden="true" />Anpassen</span>
            <span><Luggage size={14} strokeWidth={1.8} aria-hidden="true" />Ferien</span>
            <span><Flag size={14} strokeWidth={1.8} aria-hidden="true" />Feiertag</span>
            <span><Cake size={14} strokeWidth={1.8} aria-hidden="true" />Geburtstag</span>
            <span><School size={14} strokeWidth={1.8} aria-hidden="true" />Kita</span>
          </span>
        }
      >
        <div className="personal-days" role="group" aria-label="Tag auswählen">
          {week.days.map((item) => (
            <DayButton key={item.date} day={item} selected={item.date === day.date} issues={issues.filter((issue) => issue.date === item.date)} onSelect={() => setDate(item.date)} />
          ))}
        </div>
      </Block>

      <WeekTimeline week={week} shifts={plan.shifts} />

      <DayDetail
        day={day}
        shifts={plan.shifts}
        onAdd={(lane) => {
          const opening = openingOf(day.date)
          const cleaning = state.rules.cleaning.find((item) => item.enabled && item.days.includes(weekdayKeyOf(day.date)))
          const start = lane === "putzkraft" ? (cleaning?.start ?? 8 * 60 + 30) : (opening?.start ?? 10 * 60)
          const end = lane === "putzkraft" ? (cleaning?.end ?? 10 * 60) : (opening?.end ?? 19 * 60)
          const employeeId = preferredEmployee(state.employees, state.availability, state.exceptions, lane, day.date, start, end) ?? undefined
          setShiftDraft({ date: day.date, start, end, kind: laneKind(lane), lane, employeeId })
        }}
        onEdit={(shift) => setShiftDraft({ id: shift.id, employeeId: shift.employeeId, date: shift.date, start: shift.start, end: shift.end, kind: shift.kind })}
        onRemove={removeShift}
        onProposal={() => setProposalOpen(true)}
      />

      <ShiftDialog draft={shiftDraft} week={week} state={state} shifts={plan.shifts} onClose={() => setShiftDraft(null)} onSave={saveShift} onRemove={removeShift} />
      <ProposalDialog
        open={proposalOpen}
        week={week}
        state={state}
        shifts={plan.shifts}
        onClose={() => setProposalOpen(false)}
        onApply={(next, summary) => {
          commit({ type: "applyProposal", weekId, shifts: next }, "Planvorschlag übernommen", { description: `${summary}. Der Plan ist im Entwurf.` })
          setProposalOpen(false)
        }}
      />
    </div>
  )
}

function countPhrase(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function DayButton({ day, selected, issues, onSelect }: { day: PlanDay; selected: boolean; issues: PlanIssue[]; onSelect: () => void }) {
  const Weather = weatherIcons[day.weather.symbol]
  const birthdays = day.bookings.filter((booking) => booking.kind === "geburtstag").length
  const kita = day.bookings.filter((booking) => booking.kind === "kita").length
  const blocked = issues.some((issue) => issue.severity === "blocker")
  const needsWork = issues.length > 0
  const notes = [day.ferien ? "Ferien" : null, day.holiday ?? null, needsWork ? "Schichtplan fehlt oder muss angepasst werden" : "Schichtplan in Ordnung"].filter(Boolean)
  const label = `${formatWeekdayLong(day.date)}, ${formatShortDate(day.date)}, ${day.weather.temperature} Grad, ${countPhrase(birthdays, "Geburtstag", "Geburtstage")}, ${countPhrase(kita, "Kita-Besuch", "Kita-Besuche")}`
  return (
    <button type="button" className="personal-day" data-selected={selected} data-state={blocked ? "blocked" : issues.length > 0 ? "hint" : "ok"} aria-pressed={selected} aria-label={notes.length > 0 ? `${label}, ${notes.join(", ")}` : label} onClick={onSelect}>
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
    </button>
  )
}

function CountMark({ icon: Icon, count, label }: { icon: LucideIcon; count: number; label: string }) {
  return (
    <span className="personal-count" role="img" aria-label={label}>
      <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
      <span aria-hidden="true">{count}</span>
    </span>
  )
}

function shiftSpan(bar: { start: number; end: number; shifts: Shift[] }): string {
  const ordered = [...bar.shifts].sort((a, b) => a.start - b.start)
  const broken = ordered.some((shift, index) => index > 0 && shift.start > ordered[index - 1]!.end)
  if (!broken) return formatRange(bar.start, bar.end)
  return ordered.map((shift) => formatRange(shift.start, shift.end)).join(", ")
}

function DayDetail({
  day,
  shifts,
  onAdd,
  onEdit,
  onRemove,
  onProposal,
}: {
  day: PlanDay
  shifts: readonly Shift[]
  onAdd: (lane: ShiftLane) => void
  onEdit: (shift: Shift) => void
  onRemove: (shift: Shift) => void
  onProposal: () => void
}) {
  const { state } = usePersonal()
  const { rules } = state
  const key = dayKeyFor(day, rules)
  const special = specialOpeningOf(day, rules)
  const windows = useMemo(() => bookingWindows(day, shifts, rules), [day, shifts, rules])
  const roster = useMemo(() => staffDay(day, shifts, state.employees, rules), [day, shifts, state.employees, rules])
  const lookup = new Map(state.employees.map((employee, index) => [employee.id, { employee, index }]))
  const hasService = roster.lead !== null || roster.staff.length > 0

  function renderBar(bar: { employeeId: string; start: number; end: number; shifts: Shift[]; primary: Shift }) {
    const entry = lookup.get(bar.employeeId)
    const name = entry?.employee.name ?? "Unbekannt"
    const fit = checkAvailability(state.availability[bar.employeeId], state.exceptions, bar.employeeId, day.date, bar.primary.start, bar.primary.end)
    return (
      <li key={bar.employeeId}>
        <PersonAvatar name={name} index={entry?.index} />
        <span className="personal-shift-text">
          <strong>{name}</strong>
          <small>{entry ? roleLabels[entry.employee.role] : ""}</small>
        </span>
        <span className="personal-shift-time">
          <strong>{shiftSpan(bar)}</strong>
          <small>{durationLabel(bar.end - bar.start)}</small>
        </span>
        <span className="personal-shift-tags">
          {!fit.ok ? <small>beginnt {formatTime(bar.primary.start)}, {fit.reason}</small> : null}
        </span>
        <span className="personal-shift-actions">
          <RowAction action="edit" rowName={name} onClick={() => onEdit(bar.primary)} />
          <RowAction action="remove" rowName={name} onClick={() => onRemove(bar.primary)} />
        </span>
      </li>
    )
  }

  return (
    <Block
      className="personal-day-block"
      title="Schichtzuweisung"
      columns={2}
      actions={hasService ? undefined : <ActionButton action="propose" onClick={onProposal} />}
    >
      <div className="personal-day-status">
        <div className="personal-pills">
          {day.holiday ? <Pill tone="orange">{day.holiday}</Pill> : null}
          {day.ferien ? <Pill tone="blue">Ferien</Pill> : null}
          {special ? <Pill tone="amber">Sonderöffnung {formatTime(special.openAt)}</Pill> : null}
          {roster.proposal ? <Pill tone="blue">Vorschlag</Pill> : null}
        </div>
      </div>
      <div>
        <h3 className="personal-subhead">Buchungen</h3>
        {windows.length === 0 ? (
          <p className="fine-print">Keine Buchungen an diesem Tag.</p>
        ) : (
          <ul className="personal-booking-rows">
            {windows.map((window) => (
              <li key={window.key} className="personal-booking-row">
                <strong>{formatRange(window.start, window.end)}</strong>
                <span className="personal-counts">
                  <CountMark icon={Cake} count={window.birthdays} label={countPhrase(window.birthdays, "Geburtstag", "Geburtstage")} />
                  <CountMark icon={School} count={window.kita} label={countPhrase(window.kita, "Kita-Buchung", "Kita-Buchungen")} />
                  <CountMark icon={Users} count={window.persons} label={countPhrase(window.persons, "Person", "Personen")} />
                </span>
                <span className="personal-counts">
                  <CountMark icon={Cake} count={window.birthdays} label={countPhrase(window.birthdays, "Geburtstag", "Geburtstage")} />
                  <CountMark icon={Baby} count={window.children} label={countPhrase(window.children, "Kind", "Kinder")} />
                  <CountMark icon={User} count={window.adults} label={countPhrase(window.adults, "Erwachsener", "Erwachsene")} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="personal-subhead">Schichten</h3>
        <div className="personal-role-windows">
          <RoleWindow title="Schichtleiter" hint="Pflicht" lane="schichtleiter" empty="Schichtleitung fehlt" bars={roster.lead ? [roster.lead] : []} onAdd={onAdd} renderBar={renderBar} />
          <RoleWindow title="Mitarbeiter" hint="mindestens eine Person" lane="mitarbeiter" empty="Mindestens eine Person" bars={roster.staff} onAdd={onAdd} renderBar={renderBar} />
          <RoleWindow title="Putzkraft" hint="optional" lane="putzkraft" bars={roster.cleaning} onAdd={onAdd} renderBar={renderBar} />
        </div>
        {roster.people > 0 ? (
          <p className="fine-print">{countPhrase(roster.people, "Person", "Personen")} · {hoursLabel(roster.minutes)} an diesem Tag</p>
        ) : null}
      </div>
    </Block>
  )
}

function RoleWindow({
  title,
  hint,
  lane,
  empty,
  bars,
  onAdd,
  renderBar,
}: {
  title: string
  hint: string
  lane: ShiftLane
  empty?: string
  bars: { employeeId: string; start: number; end: number; shifts: Shift[]; primary: Shift }[]
  onAdd: (lane: ShiftLane) => void
  renderBar: (bar: { employeeId: string; start: number; end: number; shifts: Shift[]; primary: Shift }) => ReactNode
}) {
  const missing = bars.length === 0 && Boolean(empty)
  return (
    <section className="personal-role-window" aria-label={title}>
      <header className="personal-role-head">
        <div className="personal-role-title">
          <TooltipProvider delayDuration={400}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="personal-role-info" aria-label={hint}>
                  <Info size={16} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="start" sideOffset={8}>{hint}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <h3 className="personal-subhead">{title}</h3>
          {missing ? <CircleAlert className="personal-role-missing" size={16} strokeWidth={1.8} role="img" aria-label={empty} /> : null}
        </div>
        <ActionButton action="add" variant="icon" label={`${title} hinzufügen`} onClick={() => onAdd(lane)} />
      </header>
      {bars.length > 0 ? <ul className="personal-shift-list">{bars.map(renderBar)}</ul> : null}
    </section>
  )
}
