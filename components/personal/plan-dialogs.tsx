"use client"

import { useMemo, useState } from "react"
import { Info, TriangleAlert } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { JellyButton } from "@/components/ui/jelly-button"
import {
  durationLabel,
  evaluateWeek,
  formatRange,
  formatShortDate,
  formatWeekRange,
  formatWeekdayLong,
  proposeWeek,
  type PersonalState,
  type PlanIssue,
  type PlanWeek,
  type Shift,
} from "@/lib/personal"
import { Pill } from "./personal-ui"
import { SegmentNav } from "./segment-nav"

type Mode = "fill" | "rebuild"

export function ProposalDialog({
  open,
  week,
  state,
  shifts,
  onClose,
  onApply,
}: {
  open: boolean
  week: PlanWeek
  state: PersonalState
  shifts: readonly Shift[]
  onClose: () => void
  onApply: (next: Shift[], summary: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent showCloseButton={false} className="article-dialog personal-dialog personal-dialog-wide">
        {open ? <ProposalBody week={week} state={state} shifts={shifts} onClose={onClose} onApply={onApply} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function ProposalBody({
  week,
  state,
  shifts,
  onClose,
  onApply,
}: {
  week: PlanWeek
  state: PersonalState
  shifts: readonly Shift[]
  onClose: () => void
  onApply: (next: Shift[], summary: string) => void
}) {
  const [mode, setMode] = useState<Mode>(shifts.length === 0 ? "rebuild" : "fill")
  const proposal = useMemo(() => proposeWeek(week, shifts, state, mode), [week, shifts, state, mode])
  const remaining = useMemo(
    () => evaluateWeek(week, proposal.shifts, state).filter((issue) => issue.severity === "blocker"),
    [week, proposal.shifts, state],
  )
  const names = new Map(state.employees.map((employee) => [employee.id, employee.name]))
  const byDay = week.days
    .map((day) => ({ date: day.date, items: proposal.added.filter((shift) => shift.date === day.date) }))
    .filter((group) => group.items.length > 0)
  const unchanged = proposal.added.length === 0 && proposal.removed.length === 0

  return (
    <>
      <DialogTitle>Planvorschlag für {formatWeekRange(week.start, week.end)}</DialogTitle>
      <DialogDescription>
        Berechnet aus Besetzungsregeln, Verfügbarkeit sowie Soll- und Höchststunden. Du siehst das Ergebnis, bevor etwas im Entwurf ändert.
      </DialogDescription>
      <SegmentNav
        label="Art des Vorschlags"
        value={mode}
        onChange={setMode}
        items={[
          { value: "fill", label: "Lücken ergänzen" },
          { value: "rebuild", label: "Neu berechnen" },
        ]}
      />
      <p className="personal-field-hint">
        {mode === "fill"
          ? "Bestehende Schichten bleiben unverändert. Nur fehlende Besetzung wird ergänzt."
          : shifts.length > 0
            ? `Alle ${shifts.length} bestehenden Schichten werden durch den Vorschlag ersetzt.`
            : "Für diese Woche gibt es noch keine Schichten."}
      </p>
      <div className="personal-proposal-stats" aria-live="polite">
        <Pill tone={proposal.added.length > 0 ? "green" : "neutral"}>+ {proposal.added.length} Schichten</Pill>
        {mode === "rebuild" && proposal.removed.length > 0 ? <Pill tone="amber">− {proposal.removed.length} entfernt</Pill> : null}
        <Pill tone={remaining.length > 0 ? "amber" : "green"}>{remaining.length === 0 ? "Keine offenen Punkte" : `${remaining.length} offene Punkte`}</Pill>
      </div>
      {unchanged ? (
        <div className="empty-state personal-proposal-empty">
          <h3>Kein Vorschlag nötig</h3>
          <p>Mit den aktuellen Regeln fehlt keine Schicht, die sich automatisch besetzen lässt.</p>
        </div>
      ) : (
        <div className="personal-proposal-list" tabIndex={0} aria-label="Vorgeschlagene Schichten">
          {byDay.map((group) => (
            <section key={group.date}>
              <h3>
                {formatWeekdayLong(group.date)}, {formatShortDate(group.date)}
              </h3>
              <ul>
                {group.items.map((shift) => (
                  <li key={shift.id}>
                    <span>{names.get(shift.employeeId)}</span>
                    <span>
                      {formatRange(shift.start, shift.end)} · {durationLabel(shift.end - shift.start)}
                    </span>
                    {shift.kind === "cleaning" ? <Pill tone="blue">Reinigung</Pill> : <span />}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {remaining.length > 0 ? (
        <div className="callout amber personal-note" role="status">
          <TriangleAlert size={20} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <strong>Nach dem Vorschlag bleibt offen</strong>
            <ul className="personal-plain-list">
              {remaining.map((issue) => (
                <li key={issue.id}>{issue.message}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      <div className="request-actions personal-dialog-actions">
        <JellyButton variant="soft" onClick={onClose}>
          Abbrechen
        </JellyButton>
        <JellyButton
          disabled={unchanged}
          onClick={() =>
            onApply(
              proposal.shifts,
              mode === "fill" ? `${proposal.added.length} Schichten ergänzt` : `${proposal.added.length} Schichten neu berechnet`,
            )
          }
        >
          Vorschlag in den Entwurf übernehmen
        </JellyButton>
      </div>
      <p className="fine-print personal-duration">Rechenregel, keine KI. Es wird nichts an Mitarbeitende gesendet und nichts veröffentlicht.</p>
    </>
  )
}

export function PublishDialog({
  open,
  week,
  hints,
  onClose,
  onConfirm,
}: {
  open: boolean
  week: PlanWeek
  hints: PlanIssue[]
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent showCloseButton={false} className="article-dialog personal-dialog">
        {open ? <PublishBody week={week} hints={hints} onClose={onClose} onConfirm={onConfirm} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function PublishBody({
  week,
  hints,
  onClose,
  onConfirm,
}: {
  week: PlanWeek
  hints: PlanIssue[]
  onClose: () => void
  onConfirm: () => void
}) {
  const [acknowledged, setAcknowledged] = useState(hints.length === 0)
  return (
    <>
      <DialogTitle>Dienstplan veröffentlichen</DialogTitle>
      <DialogDescription>
        {formatWeekRange(week.start, week.end)} wird in dieser Demo als veröffentlicht markiert. Es wird keine Nachricht verschickt und keine Zusage eingeholt.
      </DialogDescription>
      {hints.length > 0 ? (
        <div className="callout blue personal-note">
          <Info size={20} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <strong>{hints.length === 1 ? "Ein Hinweis" : `${hints.length} Hinweise`} zur Kenntnis</strong>
            <ul className="personal-plain-list">
              {hints.map((issue) => (
                <li key={issue.id}>{issue.message}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {hints.length > 0 ? (
        <label className="personal-check">
          <Checkbox checked={acknowledged} onCheckedChange={(value) => setAcknowledged(value === true)} />
          <span>Ich habe {hints.length === 1 ? "den Hinweis" : "die Hinweise"} geprüft und veröffentliche trotzdem.</span>
        </label>
      ) : null}
      <div className="request-actions personal-dialog-actions">
        <JellyButton variant="soft" onClick={onClose}>
          Abbrechen
        </JellyButton>
        <JellyButton disabled={!acknowledged} onClick={onConfirm}>
          In der Demo veröffentlichen
        </JellyButton>
      </div>
    </>
  )
}
