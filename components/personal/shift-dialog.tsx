"use client"

import { useMemo, useState } from "react"
import { Info, TriangleAlert } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { GlideSelect } from "@/components/ui/glide-select"
import { JellyButton } from "@/components/ui/jelly-button"
import {
  checkAvailability,
  durationLabel,
  formatFullDate,
  formatWeekdayLong,
  roleLabels,
  shiftsOn,
  type PersonalState,
  type PlanWeek,
  type Shift,
  type ShiftKind,
} from "@/lib/personal"
import { Field, TimeField } from "./personal-ui"
import { SegmentNav } from "./segment-nav"

export type ShiftDraft = {
  id?: string
  employeeId?: string
  date: string
  start: number
  end: number
  kind: ShiftKind
}

const EARLIEST = 6 * 60
const LATEST = 23 * 60

export function ShiftDialog({
  draft,
  week,
  state,
  shifts,
  onClose,
  onSave,
  onRemove,
}: {
  draft: ShiftDraft | null
  week: PlanWeek
  state: PersonalState
  shifts: readonly Shift[]
  onClose: () => void
  onSave: (shift: ShiftDraft & { employeeId: string }) => void
  onRemove: (shift: Shift) => void
}) {
  return (
    <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent showCloseButton={false} className="article-dialog personal-dialog">
        {draft ? (
          <ShiftForm key={draft.id ?? `${draft.date}-${draft.start}-${draft.end}-${draft.kind}`} draft={draft} week={week} state={state} shifts={shifts} onClose={onClose} onSave={onSave} onRemove={onRemove} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ShiftForm({
  draft,
  week,
  state,
  shifts,
  onClose,
  onSave,
  onRemove,
}: {
  draft: ShiftDraft
  week: PlanWeek
  state: PersonalState
  shifts: readonly Shift[]
  onClose: () => void
  onSave: (shift: ShiftDraft & { employeeId: string }) => void
  onRemove: (shift: Shift) => void
}) {
  const existing = draft.id ? shifts.find((item) => item.id === draft.id) : undefined
  const initialEmployee = useMemo(() => {
    if (draft.employeeId) return draft.employeeId
    const fit = state.employees.find((employee) => {
      if (draft.kind === "service" && employee.role === "reinigungskraft") return false
      return checkAvailability(state.availability[employee.id], state.exceptions, employee.id, draft.date, draft.start, draft.end).ok
    })
    return (fit ?? state.employees[0]!).id
  }, [draft, state])

  const [employeeId, setEmployeeId] = useState(initialEmployee)
  const [date, setDate] = useState(draft.date)
  const [start, setStart] = useState<number | null>(draft.start)
  const [end, setEnd] = useState<number | null>(draft.end)
  const [kind, setKind] = useState<ShiftKind>(draft.kind)

  const employee = state.employees.find((item) => item.id === employeeId)
  let error: string | null = null
  if (start === null || end === null) error = "Bitte Beginn und Ende als Uhrzeit angeben, zum Beispiel 08:45."
  else if (end <= start) error = "Das Ende muss nach dem Beginn liegen."
  else if (start < EARLIEST || end > LATEST) error = "Schichten liegen zwischen 06:00 und 23:00 Uhr."
  else if (end - start < 30) error = "Eine Schicht dauert mindestens 30 Minuten."

  const clash =
    !error && start !== null && end !== null
      ? shiftsOn(shifts, date).find((item) => item.employeeId === employeeId && item.id !== draft.id && item.start < end && start < item.end)
      : undefined
  const availability =
    !error && start !== null && end !== null
      ? checkAvailability(state.availability[employeeId], state.exceptions, employeeId, date, start, end)
      : null

  const employeeOptions = state.employees.map((item) => ({ value: item.id, label: `${item.name} · ${roleLabels[item.role]}` }))
  const dateOptions = week.days.map((day) => ({ value: day.date, label: `${formatWeekdayLong(day.date)}, ${formatFullDate(day.date)}` }))

  return (
    <>
      <DialogTitle>{existing ? "Schicht bearbeiten" : "Schicht hinzufügen"}</DialogTitle>
      <DialogDescription>
        {existing ? "Änderungen setzen den Plan zurück in den Entwurf." : "Die Schicht gehört zum Entwurf. Es geht keine Nachricht an Mitarbeitende."}
      </DialogDescription>
      <div className="personal-form">
        <Field label="Mitarbeiter">
          <GlideSelect className="personal-select" options={employeeOptions} value={employeeId} onChange={setEmployeeId} showTags={false} size="sm" ariaLabel="Mitarbeiter" />
        </Field>
        <Field label="Tag">
          <GlideSelect className="personal-select" options={dateOptions} value={date} onChange={setDate} showTags={false} size="sm" ariaLabel="Tag" />
        </Field>
        <div className="personal-form-row">
          <TimeField label="Beginn" value={start} onChange={setStart} />
          <TimeField label="Ende" value={end} onChange={setEnd} />
        </div>
        <Field label="Art der Schicht">
          <SegmentNav
            label="Art der Schicht"
            value={kind}
            onChange={setKind}
            items={[
              { value: "service", label: "Dienst" },
              { value: "cleaning", label: "Reinigung" },
            ]}
          />
        </Field>
      </div>
      {error ? (
        <p className="personal-field-error" role="alert">
          {error}
        </p>
      ) : null}
      {clash ? (
        <div className="callout amber personal-note" role="status">
          <TriangleAlert size={20} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <strong>Überschneidung</strong>
            <p>{employee?.name} hat am selben Tag schon eine Schicht in diesem Zeitraum. Die Prüfung blockiert das Veröffentlichen.</p>
          </div>
        </div>
      ) : null}
      {availability && !availability.ok ? (
        <div className="callout blue personal-note" role="status">
          <Info size={20} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <strong>Hinweis zur Verfügbarkeit</strong>
            <p>
              {employee?.name} ist {availability.reason}. Du kannst die Schicht trotzdem speichern; die Zusage steht dann noch aus.
            </p>
          </div>
        </div>
      ) : null}
      {employee?.role === "reinigungskraft" && kind === "service" ? (
        <p className="personal-field-hint">Reinigungskräfte zählen nicht zur Besetzung im Gästebetrieb.</p>
      ) : null}
      <div className="request-actions personal-dialog-actions">
        <JellyButton variant="soft" onClick={onClose}>
          Abbrechen
        </JellyButton>
        {existing ? (
          <JellyButton variant="soft" onClick={() => onRemove(existing)}>
            Schicht entfernen
          </JellyButton>
        ) : null}
        <JellyButton
          disabled={Boolean(error)}
          onClick={() => {
            if (start === null || end === null || error) return
            onSave({ id: draft.id, employeeId, date, start, end, kind })
          }}
        >
          {existing ? "Änderung speichern" : "Schicht speichern"}
        </JellyButton>
      </div>
      {!error && start !== null && end !== null ? <p className="fine-print personal-duration">Dauer: {durationLabel(end - start)}</p> : null}
    </>
  )
}
