"use client"

import { useMemo, useState } from "react"
import { Check, Clock3, LogIn, LogOut, X } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { JellyButton } from "@/components/ui/jelly-button"
import { KpiCard } from "@/components/ui/kpi-card"
import {
  DEMO_DATE,
  REASON_MAX,
  correctionSummary,
  durationLabel,
  formatFullDate,
  formatRange,
  formatShortDate,
  formatTime,
  formatWeekdayLong,
  hoursLabel,
  openCorrections,
  plannedShiftFor,
  roleLabels,
  shiftsOn,
  startDeviation,
  validateCorrection,
  workedMinutes,
  planWeeks,
  type Correction,
  type Employee,
  type Punch,
} from "@/lib/personal"
import { usePersonal } from "./personal-context"
import { PersonAvatar, Pill, TimeField, useFocusReturn } from "./personal-ui"
import { SegmentNav } from "./segment-nav"

type Sub = "heute" | "korrekturen"

export function ZeiterfassungTab() {
  const { state, commit, clock, advanceClock } = usePersonal()
  const [sub, setSub] = useState<Sub>("heute")
  const [correctionFor, setCorrectionFor] = useState<Punch | null>(null)

  const todayShifts = useMemo(() => planWeeks.flatMap((week) => shiftsOn(state.plans[week.id]?.shifts ?? [], DEMO_DATE)), [state.plans])
  const todayPunches = state.punches.filter((punch) => punch.date === DEMO_DATE)
  const open = openCorrections(state.corrections)
  const running = todayPunches.filter((punch) => punch.end === null)
  const worked = todayPunches.reduce((sum, punch) => sum + workedMinutes(punch, clock), 0)

  const rows = state.employees
    .map((employee, index) => {
      const punch = [...todayPunches].reverse().find((item) => item.employeeId === employee.id)
      const planned = todayShifts.filter((shift) => shift.employeeId === employee.id && shift.kind === "service").sort((a, b) => a.start - b.start)[0]
      return { employee, index, punch, planned }
    })
    .filter((row) => row.punch || row.planned)
    .sort((a, b) => (a.planned?.start ?? a.punch?.start ?? 0) - (b.planned?.start ?? b.punch?.start ?? 0) || a.employee.name.localeCompare(b.employee.name))

  const planned = new Set(todayShifts.filter((shift) => shift.kind === "service").map((shift) => shift.employeeId))

  function clockIn(employee: Employee) {
    commit({ type: "clockIn", employeeId: employee.id, date: DEMO_DATE, minute: clock }, `${employee.name} eingestempelt`, { description: `${formatTime(clock)} Uhr · Demo-Uhr` })
  }

  function clockOut(employee: Employee, punch: Punch) {
    commit({ type: "clockOut", punchId: punch.id, minute: clock }, `${employee.name} ausgestempelt`, {
      description: `${formatRange(punch.start, clock)} · ${durationLabel(clock - punch.start)}`,
    })
  }

  return (
    <div className="personal-tab">
      <section className="kpi-row personal-kpis personal-kpis-three" aria-label="Kennzahlen heute">
        <KpiCard label="Eingestempelt" value={running.length} deltaLabel={`von ${planned.size} geplanten Mitarbeitenden`} icon={<LogIn aria-hidden="true" strokeWidth={1.8} />} />
        <KpiCard label="Erfasste Zeit heute" value={hoursLabel(worked)} deltaLabel={`Stand ${formatTime(clock)} Uhr`} icon={<Clock3 aria-hidden="true" strokeWidth={1.8} />} />
        <KpiCard label="Offene Korrekturen" value={open.length} deltaLabel={open.length === 0 ? "Alles entschieden" : "Warten auf Entscheidung"} icon={<Check aria-hidden="true" strokeWidth={1.8} />} />
      </section>

      <div className="personal-toolbar">
        <SegmentNav
          label="Zeiterfassung"
          value={sub}
          onChange={setSub}
          items={[
            { value: "heute", label: "Heute" },
            { value: "korrekturen", label: open.length > 0 ? `Korrekturen (${open.length})` : "Korrekturen" },
          ]}
        />
        <div className="personal-clock">
          <Clock3 size={16} strokeWidth={1.8} aria-hidden="true" />
          <span>
            Demo-Uhr · {formatWeekdayLong(DEMO_DATE)}, {formatFullDate(DEMO_DATE)} · <strong>{formatTime(clock)} Uhr</strong>
          </span>
          <JellyButton variant="soft" onClick={() => advanceClock(30)} disabled={clock >= 24 * 60 - 1}>
            + 30 Min.
          </JellyButton>
        </div>
      </div>

      {sub === "heute" ? (
        <section className="personal-section" aria-label="Zeiten heute">
          <div className="section-head">
            <h2>Zeiten heute</h2>
            <Pill>Soll aus dem Dienstplan</Pill>
          </div>
          {rows.length === 0 ? (
            <div className="empty-state personal-empty">
              <h3>Heute ist niemand eingeplant</h3>
              <p>Sobald im Dienstplan Schichten für heute stehen, erscheinen sie hier zum Ein- und Ausstempeln.</p>
            </div>
          ) : (
            <ul className="personal-punch-list">
              {rows.map(({ employee, index, punch, planned: shift }) => {
                const correction = punch ? state.corrections.find((item) => item.punchId === punch.id && item.status === "offen") : undefined
                const isOpen = punch?.end === null
                const deviation = punch ? startDeviation(plannedShiftFor(todayShifts, punch), punch) : null
                const late = !punch && shift && shift.start < clock
                return (
                  <li key={employee.id}>
                    <span className="personal-punch-person">
                      <PersonAvatar name={employee.name} index={index} />
                      <span>
                        <strong>{employee.name}</strong>
                        <small>{roleLabels[employee.role]}</small>
                      </span>
                    </span>
                    <span className="personal-punch-cell">
                      <small>Soll</small>
                      <strong>{shift ? formatRange(shift.start, shift.end) : "Nicht geplant"}</strong>
                    </span>
                    <span className="personal-punch-cell">
                      <small>Ist</small>
                      <strong>
                        {punch
                          ? isOpen
                            ? `seit ${formatTime(punch.start)} · ${durationLabel(workedMinutes(punch, clock))}`
                            : `${formatRange(punch.start, punch.end!)} · ${durationLabel(workedMinutes(punch, clock))}`
                          : "Noch nicht gestempelt"}
                      </strong>
                      {deviation ? <small>{deviation}</small> : late ? <small>Schicht hat um {formatTime(shift.start)} Uhr begonnen</small> : null}
                      <span className="personal-punch-status">
                        {isOpen ? <Pill tone="green">Eingestempelt</Pill> : punch ? <Pill>Beendet</Pill> : late ? <Pill tone="amber">Nicht gestempelt</Pill> : <Pill>Geplant</Pill>}
                        {correction ? <Pill tone="blue">Korrektur offen</Pill> : null}
                      </span>
                    </span>
                    <span className="personal-punch-actions">
                      {!punch ? (
                        <JellyButton onClick={() => clockIn(employee)}>
                          <LogIn size={16} strokeWidth={1.8} aria-hidden="true" />
                          Einstempeln
                        </JellyButton>
                      ) : null}
                      {punch && isOpen ? (
                        <JellyButton variant="soft" disabled={clock <= punch.start} onClick={() => clockOut(employee, punch)}>
                          <LogOut size={16} strokeWidth={1.8} aria-hidden="true" />
                          Ausstempeln
                        </JellyButton>
                      ) : null}
                      {punch && !correction ? (
                        <JellyButton variant="soft" aria-label={`Korrektur für ${employee.name} anfragen`} onClick={() => setCorrectionFor(punch)}>
                          Korrektur anfragen
                        </JellyButton>
                      ) : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="fine-print">Stempelzeiten sind lokale Demo-Daten und laufen nicht in eine Lohnabrechnung. Die Uhr läuft in Echtzeit ab 16:30 Uhr und lässt sich mit „+ 30 Min.“ vorstellen.</p>
        </section>
      ) : (
        <section className="personal-section" aria-label="Korrekturen">
          <div className="section-head">
            <h2>Korrekturen</h2>
            <Pill tone={open.length > 0 ? "blue" : "neutral"}>{open.length === 0 ? "Keine offen" : `${open.length} offen`}</Pill>
          </div>
          {state.corrections.length === 0 ? (
            <div className="empty-state personal-empty">
              <h3>Keine Korrekturen</h3>
              <p>Korrekturen entstehen, wenn jemand eine Stempelzeit ändern möchte. Du entscheidest hier darüber.</p>
            </div>
          ) : (
            <ul className="personal-correction-list">
              {[...state.corrections].sort((a, b) => Number(b.status === "offen") - Number(a.status === "offen")).map((correction) => (
                <CorrectionRow key={correction.id} correction={correction} />
              ))}
            </ul>
          )}
        </section>
      )}

      <CorrectionDialog punch={correctionFor} onClose={() => setCorrectionFor(null)} />
    </div>
  )
}

function CorrectionRow({ correction }: { correction: Correction }) {
  const { state, commit } = usePersonal()
  const punch = state.punches.find((item) => item.id === correction.punchId)
  const index = state.employees.findIndex((item) => item.id === correction.employeeId)
  const employee = state.employees[index]
  const name = employee?.name ?? "Unbekannt"
  const tone = correction.status === "offen" ? "blue" : correction.status === "genehmigt" ? "green" : "neutral"
  const label = correction.status === "offen" ? "Offen" : correction.status === "genehmigt" ? "Genehmigt" : "Abgelehnt"
  return (
    <li>
      <span className="personal-punch-person">
        <PersonAvatar name={name} index={index} />
        <span>
          <strong>{name}</strong>
          <small>{punch ? formatShortDate(punch.date) : ""}</small>
        </span>
      </span>
      <span className="personal-correction-text">
        <strong>{correctionSummary(correction)}</strong>
        <small>„{correction.reason}“</small>
      </span>
      <Pill tone={tone}>{label}</Pill>
      {correction.status === "offen" ? (
        <span className="personal-punch-actions">
          <JellyButton onClick={() => commit({ type: "decideCorrection", id: correction.id, decision: "genehmigt" }, "Korrektur genehmigt", { description: `${name} · ${correctionSummary(correction)}` })}>
            <Check size={16} strokeWidth={1.8} aria-hidden="true" />
            Genehmigen
          </JellyButton>
          <JellyButton variant="soft" onClick={() => commit({ type: "decideCorrection", id: correction.id, decision: "abgelehnt" }, "Korrektur abgelehnt", { description: `${name} · Die Stempelzeit bleibt unverändert.` })}>
            <X size={16} strokeWidth={1.8} aria-hidden="true" />
            Ablehnen
          </JellyButton>
        </span>
      ) : (
        <span />
      )}
    </li>
  )
}

function CorrectionDialog({ punch, onClose }: { punch: Punch | null; onClose: () => void }) {
  const focusReturn = useFocusReturn()
  return (
    <Dialog open={punch !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent showCloseButton={false} className="article-dialog personal-dialog" {...focusReturn}>
        {punch ? <CorrectionForm key={punch.id} punch={punch} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function CorrectionForm({ punch, onClose }: { punch: Punch; onClose: () => void }) {
  const { state, commit } = usePersonal()
  const employee = state.employees.find((item) => item.id === punch.employeeId)
  const [field, setField] = useState<"start" | "end">(punch.end === null ? "start" : "end")
  const [time, setTime] = useState<number | null>(punch.end === null ? punch.start : punch.end)
  const [reason, setReason] = useState("")
  const [touched, setTouched] = useState(false)
  const error = validateCorrection(punch, field, time, reason)
  const shown = touched ? error : null

  function pickField(next: "start" | "end") {
    setField(next)
    setTime(next === "start" ? punch.start : punch.end)
    setTouched(false)
  }

  return (
    <>
      <DialogTitle>Korrektur anfragen</DialogTitle>
      <DialogDescription>
        {employee?.name} · {formatShortDate(punch.date)} · Stempelzeit {formatRange(punch.start, punch.end ?? punch.start)}
        {punch.end === null ? " (läuft)" : ""}. Die Zeit ändert sich erst, wenn die Korrektur genehmigt wird.
      </DialogDescription>
      <div className="personal-form">
        <div className="personal-field">
          <span className="personal-field-label">Was soll korrigiert werden?</span>
          <SegmentNav
            label="Zu korrigierende Zeit"
            value={field}
            onChange={pickField}
            items={[
              { value: "start", label: "Beginn" },
              { value: "end", label: "Ende", disabled: punch.end === null },
            ]}
          />
        </div>
        <TimeField label="Neue Uhrzeit" value={time} onChange={(next) => { setTime(next); setTouched(true) }} />
        <div className="personal-field">
          <label className="personal-field-label" htmlFor="correction-reason">
            Grund
          </label>
          <textarea
            id="correction-reason"
            className="personal-input personal-textarea"
            rows={3}
            maxLength={REASON_MAX + 50}
            value={reason}
            aria-invalid={Boolean(shown && reason.trim().length > REASON_MAX) || undefined}
            onChange={(event) => { setReason(event.target.value); setTouched(true) }}
          />
          <p className="personal-field-hint" aria-live="polite">
            {reason.trim().length} von {REASON_MAX} Zeichen
          </p>
        </div>
      </div>
      {shown ? (
        <p className="personal-field-error" role="alert">
          {shown}
        </p>
      ) : null}
      <div className="request-actions personal-dialog-actions">
        <JellyButton variant="soft" onClick={onClose}>
          Abbrechen
        </JellyButton>
        <JellyButton
          disabled={Boolean(error)}
          onClick={() => {
            if (error || time === null) return
            commit({ type: "requestCorrection", punchId: punch.id, field, to: time, reason }, "Korrektur angefragt", {
              description: `${employee?.name} · ${field === "start" ? "Beginn" : "Ende"} ${formatTime(time)} Uhr · wartet auf Entscheidung`,
            })
            onClose()
          }}
        >
          Korrektur anfragen
        </JellyButton>
      </div>
    </>
  )
}
