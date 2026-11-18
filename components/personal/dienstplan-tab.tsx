"use client"

import { useMemo, useState } from "react"
import {
  Cake,
  CircleCheck,
  Cloud,
  CloudDrizzle,
  CloudRain,
  CloudSun,
  Flag,
  Info,
  Luggage,
  Pencil,
  Plus,
  School,
  Sparkles,
  Sun,
  Trash2,
  TriangleAlert,
  UsersRound,
  type LucideIcon,
} from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { JellyButton } from "@/components/ui/jelly-button"
import { KpiCard } from "@/components/ui/kpi-card"
import {
  bookingWindows,
  checkAvailability,
  dayKeyFor,
  dayNames,
  dayPersons,
  durationLabel,
  evaluateWeek,
  formatFullDate,
  formatRange,
  formatShortDate,
  formatWeekRange,
  formatWeekdayLong,
  formatWeekdayShort,
  hoursLabel,
  peakGuests,
  planWeeks,
  roleLabels,
  ruleSummary,
  shiftsOn,
  specialOpeningOf,
  walkInEstimate,
  weekStats,
  formatTime,
  type PlanDay,
  type PlanIssue,
  type Shift,
  type WeatherSymbol,
} from "@/lib/personal"
import { usePersonal } from "./personal-context"
import { PersonAvatar, Pill } from "./personal-ui"
import { ProposalDialog, PublishDialog } from "./plan-dialogs"
import { SegmentNav } from "./segment-nav"
import { ShiftDialog, type ShiftDraft } from "./shift-dialog"

const weatherIcons: Record<WeatherSymbol, LucideIcon> = {
  sonne: Sun,
  wolken: Cloud,
  teilweise: CloudSun,
  regen: CloudRain,
  schauer: CloudDrizzle,
}

const weatherLabels: Record<WeatherSymbol, string> = {
  sonne: "Sonnig",
  wolken: "Bewölkt",
  teilweise: "Teils bewölkt",
  regen: "Regen",
  schauer: "Schauer",
}

function fixLabel(issue: PlanIssue): string | null {
  if (!issue.fix) return null
  if (issue.fix.type === "addShift") return issue.code === "reinigungsdienst" ? "Reinigung eintragen" : "Schicht hinzufügen"
  if (issue.fix.type === "openRules") return "Regeln prüfen"
  return "Verfügbarkeit prüfen"
}

export function DienstplanTab() {
  const { state, week, weekId, setWeekId, date, setDate, commit, setTab, openAvailability } = usePersonal()
  const plan = state.plans[weekId] ?? { shifts: [], status: "entwurf" as const }
  const issues = useMemo(() => evaluateWeek(week, plan.shifts, state), [week, plan.shifts, state])
  const blockers = issues.filter((issue) => issue.severity === "blocker")
  const hints = issues.filter((issue) => issue.severity === "hinweis")
  const stats = useMemo(() => weekStats(week, plan.shifts, state.rules), [week, plan.shifts, state.rules])
  const day = week.days.find((item) => item.date === date) ?? week.days[0]!
  const [shiftDraft, setShiftDraft] = useState<ShiftDraft | null>(null)
  const [proposalOpen, setProposalOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const published = plan.status === "veroeffentlicht"
  const employeeName = (id: string) => state.employees.find((item) => item.id === id)?.name ?? "Unbekannt"
  const targetMinutes = state.employees.reduce((sum, employee) => sum + employee.targetHours * 60, 0)

  function runFix(issue: PlanIssue) {
    const fix = issue.fix
    if (!fix) return
    setDate(issue.date)
    if (fix.type === "addShift") {
      setShiftDraft({ date: fix.date, start: fix.start, end: fix.end, kind: issue.code === "reinigungsdienst" ? "cleaning" : "service" })
    } else if (fix.type === "openRules") {
      setTab("regeln")
    } else {
      openAvailability(fix.employeeId)
    }
  }

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
      <div className="personal-toolbar">
        <SegmentNav
          label="Woche"
          value={weekId}
          onChange={setWeekId}
          items={planWeeks.map((item) => ({ value: item.id, label: formatWeekRange(item.start, item.end) }))}
        />
        <div className="personal-toolbar-actions">
          <JellyButton variant="soft" onClick={() => setProposalOpen(true)}>
            <Sparkles size={16} strokeWidth={1.8} aria-hidden="true" />
            Planvorschlag
          </JellyButton>
          {published ? (
            <JellyButton variant="soft" onClick={() => commit({ type: "setPlanStatus", weekId, status: "entwurf" }, "Plan wieder im Entwurf", { description: "Die Demo-Veröffentlichung wurde zurückgenommen." })}>
              Zurück in den Entwurf
            </JellyButton>
          ) : (
            <JellyButton disabled={blockers.length > 0} aria-describedby={blockers.length > 0 ? "publish-reason" : undefined} onClick={() => setPublishOpen(true)}>
              Veröffentlichen
            </JellyButton>
          )}
        </div>
      </div>
      {!published && blockers.length > 0 ? (
        <p className="fine-print personal-publish-reason" id="publish-reason">
          Veröffentlichen ist gesperrt, bis {blockers.length === 1 ? "der offene Punkt" : `die ${blockers.length} offenen Punkte`} geklärt {blockers.length === 1 ? "ist" : "sind"}.
        </p>
      ) : null}
      {published ? (
        <p className="fine-print personal-publish-reason">
          Als Demo veröffentlicht. Mitarbeitende wurden nicht benachrichtigt. Jede Änderung setzt den Plan wieder in den Entwurf.
        </p>
      ) : null}

      <section className="kpi-row personal-kpis" aria-label="Kennzahlen der Woche">
        <KpiCard label="Geburtstage" value={stats.birthdays} deltaLabel="Buchungen in dieser Woche" icon={<Cake aria-hidden="true" strokeWidth={1.8} />} />
        <KpiCard
          label="Kita- und Schulbesuche"
          value={stats.kitaVisits}
          deltaLabel={stats.specialOpenings > 0 ? `${stats.specialOpenings} Sonderöffnung vor 10:00` : "Keine Sonderöffnung"}
          icon={<School aria-hidden="true" strokeWidth={1.8} />}
        />
        <KpiCard label="Schichten" value={stats.shifts} deltaLabel={`von ${new Set(plan.shifts.map((shift) => shift.employeeId)).size} Mitarbeitenden`} icon={<UsersRound aria-hidden="true" strokeWidth={1.8} />} />
        <KpiCard
          label="Geplante Stunden"
          value={hoursLabel(stats.minutes)}
          deltaLabel={`Soll des Teams: ${hoursLabel(targetMinutes)}`}
          icon={<Sparkles aria-hidden="true" strokeWidth={1.8} />}
        />
      </section>

      <IssueList blockers={blockers} hints={hints} onFix={runFix} onPickDay={setDate} />

      <section className="personal-section" aria-label="Wochenübersicht">
        <div className="section-head">
          <h2>Tage der Woche</h2>
          <span className="personal-legend" aria-label="Legende">
            <span><Luggage size={14} strokeWidth={1.8} aria-hidden="true" />Ferien</span>
            <span><Flag size={14} strokeWidth={1.8} aria-hidden="true" />Feiertag</span>
            <span><UsersRound size={14} strokeWidth={1.8} aria-hidden="true" />Gruppenbuchung</span>
          </span>
        </div>
        <div className="personal-days" role="group" aria-label="Tag auswählen">
          {week.days.map((item) => (
            <DayButton key={item.date} day={item} selected={item.date === day.date} issues={issues.filter((issue) => issue.date === item.date)} onSelect={() => setDate(item.date)} />
          ))}
        </div>
      </section>

      <DayDetail
        day={day}
        shifts={plan.shifts}
        onAdd={() => setShiftDraft({ date: day.date, start: 10 * 60, end: 14 * 60, kind: "service" })}
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
      <PublishDialog
        open={publishOpen}
        week={week}
        hints={hints}
        onClose={() => setPublishOpen(false)}
        onConfirm={() => {
          commit({ type: "setPlanStatus", weekId, status: "veroeffentlicht" }, "Dienstplan als Demo veröffentlicht", { description: "Es wurde nichts an Mitarbeitende gesendet." })
          setPublishOpen(false)
        }}
      />
    </div>
  )
}

function IssueList({
  blockers,
  hints,
  onFix,
  onPickDay,
}: {
  blockers: PlanIssue[]
  hints: PlanIssue[]
  onFix: (issue: PlanIssue) => void
  onPickDay: (date: string) => void
}) {
  if (blockers.length === 0 && hints.length === 0) {
    return (
      <div className="callout green personal-issues" role="status">
        <CircleCheck size={22} strokeWidth={1.8} aria-hidden="true" />
        <div>
          <strong>Keine offenen Punkte</strong>
          <p>Besetzung, Verfügbarkeit und Regeln passen zusammen. Der Plan kann veröffentlicht werden.</p>
        </div>
      </div>
    )
  }
  const group = (items: PlanIssue[], tone: "amber" | "blue", title: string, Icon: LucideIcon) =>
    items.length > 0 ? (
      <div className={`callout ${tone} personal-issues`}>
        <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
        <div>
          <strong>{title}</strong>
          <ul className="personal-issue-list">
            {items.map((issue) => {
              const label = fixLabel(issue)
              return (
                <li key={issue.id}>
                  <button type="button" className="personal-issue-text" onClick={() => onPickDay(issue.date)}>
                    {issue.message}
                  </button>
                  {label ? (
                    <JellyButton variant="soft" onClick={() => onFix(issue)}>
                      {label}
                    </JellyButton>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    ) : null
  return (
    <>
      {group(blockers, "amber", blockers.length === 1 ? "1 offener Punkt vor dem Veröffentlichen" : `${blockers.length} offene Punkte vor dem Veröffentlichen`, TriangleAlert)}
      {group(hints, "blue", hints.length === 1 ? "1 Hinweis" : `${hints.length} Hinweise`, Info)}
    </>
  )
}

function DayButton({ day, selected, issues, onSelect }: { day: PlanDay; selected: boolean; issues: PlanIssue[]; onSelect: () => void }) {
  const Weather = weatherIcons[day.weather.symbol]
  const hasGroup = day.bookings.some((booking) => booking.kind === "kita")
  const blocked = issues.some((issue) => issue.severity === "blocker")
  const label = `${formatWeekdayLong(day.date)}, ${formatShortDate(day.date)}`
  return (
    <button type="button" className="personal-day" data-selected={selected} data-state={blocked ? "blocked" : issues.length > 0 ? "hint" : "ok"} aria-pressed={selected} aria-label={`${label}, ${day.bookings.length} Buchungen${blocked ? ", offener Punkt" : ""}`} onClick={onSelect}>
      <span className="personal-day-name">{formatWeekdayShort(day.date)}</span>
      <span className="personal-day-date">{formatShortDate(day.date)}</span>
      <span className="personal-day-weather">
        <Weather size={16} strokeWidth={1.8} aria-hidden="true" />
        {day.weather.temperature}°
      </span>
      <span className="personal-day-count">{day.bookings.length === 1 ? "1 Buchung" : `${day.bookings.length} Buchungen`}</span>
      <span className="personal-day-marks">
        {day.ferien ? <Luggage size={14} strokeWidth={1.8} aria-label="Ferien" role="img" /> : null}
        {day.holiday ? <Flag size={14} strokeWidth={1.8} aria-label="Feiertag" role="img" /> : null}
        {hasGroup ? <UsersRound size={14} strokeWidth={1.8} aria-label="Gruppenbuchung" role="img" /> : null}
      </span>
      {blocked ? <span className="personal-day-flag" aria-hidden="true" /> : null}
    </button>
  )
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
  onAdd: () => void
  onEdit: (shift: Shift) => void
  onRemove: (shift: Shift) => void
  onProposal: () => void
}) {
  const { state } = usePersonal()
  const { rules } = state
  const key = dayKeyFor(day, rules)
  const rule = rules.days[key]
  const special = specialOpeningOf(day, rules)
  const windows = useMemo(() => bookingWindows(day, shifts, rules), [day, shifts, rules])
  const dayShifts = shiftsOn(shifts, day.date)
  const minutes = dayShifts.reduce((sum, shift) => sum + shift.end - shift.start, 0)
  const Weather = weatherIcons[day.weather.symbol]
  const lookup = new Map(state.employees.map((employee, index) => [employee.id, { employee, index }]))
  const walkIns = walkInEstimate(day, key)

  return (
    <section className="personal-section personal-day-detail" aria-label={`${formatWeekdayLong(day.date)}, ${formatFullDate(day.date)}`}>
      <div className="section-head">
        <h2>
          {formatWeekdayLong(day.date)}, {formatFullDate(day.date)}
        </h2>
        <div className="personal-pills">
          {day.holiday ? <Pill tone="orange">{day.holiday}</Pill> : null}
          {day.ferien ? <Pill tone="blue">Ferien</Pill> : null}
          {special ? <Pill tone="amber">Sonderöffnung {formatTime(special.openAt)}</Pill> : null}
          <Pill>{dayNames[key]}: {ruleSummary(rule)}</Pill>
        </div>
      </div>
      <div className="personal-detail-grid">
        <div className="personal-detail-main">
          <h3 className="personal-subhead">Buchungen und Besetzung</h3>
          {windows.length === 0 ? (
            <div className="empty-state personal-empty">
              <h3>Keine Buchungen an diesem Tag</h3>
              <p>Es gilt die Grundbesetzung von {ruleSummary(rule)}.</p>
            </div>
          ) : (
            <Accordion key={day.date} type="multiple" defaultValue={windows.filter((item) => item.short).map((item) => item.key)} className="personal-windows">
              {windows.map((window) => (
                <AccordionItem key={window.key} value={window.key} className="personal-window">
                  <AccordionTrigger className="personal-window-trigger">
                    <span className="personal-window-title">
                      <strong>{formatRange(window.start, window.end)}</strong>
                      <span>
                        {[window.birthdays > 0 ? (window.birthdays === 1 ? "1 Geburtstag" : `${window.birthdays} Geburtstage`) : null, window.kita > 0 ? (window.kita === 1 ? "1 Gruppenbesuch" : `${window.kita} Gruppenbesuche`) : null].filter(Boolean).join(" · ")}
                        {" · "}
                        {window.persons} Personen
                      </span>
                    </span>
                    <Pill tone={window.short ? "amber" : "green"}>
                      {window.short ? `Personal fehlt · ${window.overlapStaff} von ${window.required}` : `${window.overlapStaff} im Dienst · Soll ${window.required}`}
                    </Pill>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="personal-booking-list">
                      {window.bookings.map((booking) => {
                        const Icon = booking.kind === "geburtstag" ? Cake : School
                        return (
                          <li key={booking.id}>
                            <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                            <span>
                              <strong>{booking.name}</strong>
                              <small>{booking.kind === "geburtstag" ? "Geburtstag" : "Kita- oder Schulbesuch"}</small>
                            </span>
                            <span>
                              {booking.children} Kinder · {booking.adults} Erwachsene
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>

        <div className="personal-detail-side">
          <div className="personal-side-head">
            <h3 className="personal-subhead">Schichten</h3>
            <JellyButton variant="soft" onClick={onAdd}>
              <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
              Schicht hinzufügen
            </JellyButton>
          </div>
          {dayShifts.length === 0 ? (
            <div className="empty-state personal-empty">
              <h3>Noch keine Schichten</h3>
              <p>Trage eine Schicht ein oder lass dir einen Planvorschlag berechnen.</p>
              <JellyButton variant="soft" onClick={onProposal}>
                <Sparkles size={16} strokeWidth={1.8} aria-hidden="true" />
                Planvorschlag ansehen
              </JellyButton>
            </div>
          ) : (
            <>
              <ul className="personal-shift-list">
                {dayShifts.map((shift) => {
                  const entry = lookup.get(shift.employeeId)
                  const name = entry?.employee.name ?? "Unbekannt"
                  const fit = checkAvailability(state.availability[shift.employeeId], state.exceptions, shift.employeeId, shift.date, shift.start, shift.end)
                  return (
                    <li key={shift.id}>
                      <PersonAvatar name={name} index={entry?.index} />
                      <span className="personal-shift-text">
                        <strong>{name}</strong>
                        <small>
                          {entry ? roleLabels[entry.employee.role] : ""}
                          {shift.kind === "cleaning" ? " · Reinigung" : ""}
                        </small>
                      </span>
                      <span className="personal-shift-time">
                        <strong>{formatRange(shift.start, shift.end)}</strong>
                        <small>{durationLabel(shift.end - shift.start)}</small>
                      </span>
                      <span className="personal-shift-tags">
                        {shift.origin === "vorschlag" ? <Pill tone="blue">Vorschlag</Pill> : null}
                        {shift.origin === "vorlage" ? <Pill>Vorlage</Pill> : null}
                        {shift.kind === "cleaning" ? <Pill tone="blue">Reinigung</Pill> : null}
                        {!fit.ok ? <Pill tone="amber">Verfügbarkeit</Pill> : null}
                      </span>
                      <span className="personal-shift-actions">
                        <JellyButton variant="icon" className="personal-icon-button" aria-label={`Schicht von ${name} bearbeiten`} onClick={() => onEdit(shift)}>
                          <Pencil size={16} strokeWidth={1.8} aria-hidden="true" />
                        </JellyButton>
                        <JellyButton variant="icon" className="personal-icon-button" aria-label={`Schicht von ${name} entfernen`} onClick={() => onRemove(shift)}>
                          <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                        </JellyButton>
                      </span>
                    </li>
                  )
                })}
              </ul>
              <p className="fine-print">
                {dayShifts.length} Schichten · {hoursLabel(minutes)} an diesem Tag
              </p>
            </>
          )}
        </div>
        <div className="personal-forecast">
          <h3 className="personal-subhead">Wetter und Erwartung</h3>
          <dl>
            <div>
              <dt>Wetter</dt>
              <dd>
                <Weather size={16} strokeWidth={1.8} aria-hidden="true" />
                {day.weather.temperature}° · {weatherLabels[day.weather.symbol]}
              </dd>
            </div>
            <div>
              <dt>Regenwahrscheinlichkeit</dt>
              <dd>{day.weather.rainPercent} %</dd>
            </div>
            <div>
              <dt>Gebuchte Personen</dt>
              <dd>{dayPersons(day)}</dd>
            </div>
            <div>
              <dt>Spitze erwarteter Gäste</dt>
              <dd>{peakGuests(day, key)}</dd>
            </div>
          </dl>
          <p className="fine-print">Spontanbesuche sind mit {walkIns} Personen angenommen (Demo-Annahme nach Wochentag und Regen, keine Prognose).</p>
        </div>
      </div>
    </section>
  )
}
