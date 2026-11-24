"use client"

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import { CalendarDays, Info, Trash2, User } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { GlideSelect } from "@/components/ui/glide-select"
import { JellyButton } from "@/components/ui/jelly-button"
import { ActionButton } from "@/components/ui/row-action"
import {
  DEMO_DATE,
  addDays,
  checkAvailability,
  compactRange,
  dayNames,
  exceptionLabels,
  formatExceptionRange,
  formatRange,
  formatShortDate,
  formatWeekdayShort,
  initialPersonalState,
  priorityLabels,
  roleLabels,
  skillKeys,
  skillLabels,
  weekdayKeys,
  type Availability,
  type AvailabilityException,
  type Employee,
  type ExceptionKind,
  type PersonalState,
  type Priority,
  type Role,
  type PlanWeek,
  type SkillKey,
  type WeekdayKey,
} from "@/lib/personal"
import { usePersonal } from "./personal-context"
import { DateField, Field, HourSelect, NumberField, Pill, useFocusReturn } from "./personal-ui"
import { SegmentNav } from "./segment-nav"

const kindOptions = (Object.keys(exceptionLabels) as ExceptionKind[]).map((value) => ({ value, label: exceptionLabels[value] }))
const weekdayOptions = weekdayKeys.map((value) => ({ value, label: dayNames[value] }))
const roleOptions = (Object.keys(roleLabels) as Role[]).map((value) => ({ value, label: roleLabels[value] }))
const priorityItems = (Object.keys(priorityLabels) as Priority[]).map((value) => ({ value, label: priorityLabels[value] }))

type Sheet = {
  employee: Employee
  availability: Availability
  exceptions: AvailabilityException[]
}

function sheetFrom(state: PersonalState, id: string): Sheet | null {
  const employee = state.employees.find((item) => item.id === id)
  const availability = state.availability[id]
  if (!employee || !availability) return null
  return {
    employee,
    availability,
    exceptions: state.exceptions
      .filter((item) => item.employeeId === id)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id)),
  }
}

function sameSheet(a: Sheet, b: Sheet): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function AvailabilityDialog() {
  const { state, availabilityEmployee, availabilityOpen, availabilityCreate, closeAvailability, releaseNewEmployee } = usePersonal()
  const employee = state.employees.find((item) => item.id === availabilityEmployee) ?? null
  const creating = availabilityCreate
  const viewState = creating
    ? {
        ...state,
        employees: [...state.employees, creating.employee],
        availability: { ...state.availability, [creating.employee.id]: creating.availability },
      }
    : state
  const activeId = creating?.employee.id ?? employee?.id ?? null
  const leaveRef = useRef<() => void>(() => closeAvailability())
  const focusReturn = useFocusReturn()
  return (
    <Dialog open={availabilityOpen && activeId !== null} onOpenChange={(open) => { if (!open) leaveRef.current() }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="article-dialog personal-dialog personal-dialog-wide" {...focusReturn}>
        {activeId ? (
          <EmployeeSheet
            key={activeId}
            employeeId={activeId}
            state={viewState}
            startEditing={creating !== null}
            leaveRef={leaveRef}
            onClose={closeAvailability}
            onSaved={releaseNewEmployee}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function EmployeeSheet({
  employeeId,
  state,
  startEditing = false,
  leaveRef,
  onClose,
  onSaved,
}: {
  employeeId: string
  state: PersonalState
  startEditing?: boolean
  leaveRef: MutableRefObject<() => void>
  onClose: () => void
  onSaved?: () => void
}) {
  const { commit, openDay, weeks } = usePersonal()
  const saved = useMemo(() => sheetFrom(state, employeeId), [state, employeeId])
  const baseline = useMemo(() => initialPersonalState().employees.find((item) => item.id === employeeId), [employeeId])
  const [editing, setEditing] = useState(startEditing)
  const [draft, setDraft] = useState<Sheet | null>(() => (startEditing && saved ? structuredClone(saved) : null))
  const [ask, setAsk] = useState(false)
  const [leaveIntent, setLeaveIntent] = useState<"window" | "edit">("window")
  const [hoursInvalid, setHoursInvalid] = useState(false)
  const [profileKey, setProfileKey] = useState(0)
  const pending = useRef<(() => void) | undefined>(undefined)
  const draftIds = useRef(0)
  const askPanel = useRef<HTMLDivElement>(null)
  const shown = editing && draft ? draft : saved
  const nameInvalid = Boolean(editing && draft && draft.employee.name.trim() === "")
  const dirty = Boolean(editing && draft && saved && !sameSheet(draft, saved))
  const blocked = editing && (hoursInvalid || nameInvalid)

  function finish(after?: () => void) {
    setAsk(false)
    setEditing(false)
    setDraft(null)
    pending.current = undefined
    onClose()
    after?.()
  }

  function endEdit() {
    setAsk(false)
    setEditing(false)
    setDraft(null)
    setHoursInvalid(false)
    pending.current = undefined
  }

  function requestLeave(after?: () => void) {
    if (ask) {
      setAsk(false)
      pending.current = undefined
      return
    }
    if (dirty) {
      pending.current = after
      setLeaveIntent("window")
      setAsk(true)
      return
    }
    finish(after)
  }

  function requestEndEdit() {
    if (ask) {
      setAsk(false)
      pending.current = undefined
      return
    }
    if (dirty) {
      pending.current = undefined
      setLeaveIntent("edit")
      setAsk(true)
      return
    }
    endEdit()
  }

  leaveRef.current = () => requestLeave()

  useEffect(() => {
    if (!ask) return
    askPanel.current?.querySelector("button")?.focus()
  }, [ask])

  function beginEdit() {
    if (!saved) return
    setDraft(structuredClone(saved))
    setHoursInvalid(false)
    setAsk(false)
    setEditing(true)
  }

  function persist() {
    if (!draft || blocked) return false
    commit(
      { type: "saveEmployeeSheet", employee: { ...draft.employee, name: draft.employee.name.trim() }, availability: draft.availability, exceptions: draft.exceptions },
      "Gespeichert",
      { description: `${draft.employee.name.trim()} ist im Dienstplan aktualisiert.` },
    )
    onSaved?.()
    return true
  }

  function saveAndStay() {
    if (!persist()) return
    setEditing(false)
    setDraft(null)
    setAsk(false)
  }

  function saveAndLeave() {
    if (!persist()) return
    if (leaveIntent === "edit") {
      endEdit()
      return
    }
    finish(pending.current)
  }

  function discardAndLeave() {
    if (leaveIntent === "edit") {
      endEdit()
      return
    }
    finish(pending.current)
  }

  function resetProfile() {
    if (!baseline || !draft) return
    setDraft({ ...draft, employee: structuredClone(baseline) })
    setProfileKey((value) => value + 1)
  }

  if (!shown || !saved) return null
  const employee = shown.employee
  const conflicts = conflictRows(weeks, state, employee.id, shown.availability, mergedExceptions(state, employee.id, shown.exceptions))
  const profileChanged = Boolean(baseline) && JSON.stringify(employee) !== JSON.stringify(baseline)

  return (
    <>
      <div className="personal-dialog-titlebar">
        <DialogTitle className="personal-dialog-title">
          <User size={20} strokeWidth={1.8} aria-hidden="true" />
          {editing && draft ? (
            <input
              className="personal-dialog-name"
              aria-label="Name"
              value={draft.employee.name}
              disabled={ask}
              autoFocus={draft.employee.name.trim() === ""}
              aria-invalid={nameInvalid}
              onChange={(event) => setDraft({ ...draft, employee: { ...draft.employee, name: event.target.value } })}
            />
          ) : (
            employee.name
          )}
        </DialogTitle>
        {ask ? null : (
          <div className="request-actions personal-dialog-actions">
            {editing && profileChanged ? <ActionButton action="reset" variant="icon" onClick={resetProfile} /> : null}
            {editing ? (
              <ActionButton action="save" variant="icon" disabled={!dirty || blocked} onClick={saveAndStay} />
            ) : (
              <ActionButton action="edit" variant="icon" onClick={beginEdit} />
            )}
            <ActionButton action="close" variant="icon" onClick={() => { if (editing) requestEndEdit(); else requestLeave() }} />
          </div>
        )}
      </div>
      <fieldset className="personal-sheet" disabled={ask}>
        {editing && draft ? (
          <>
            <ProfileEditor
              key={profileKey}
              employee={draft.employee}
              onEmployee={(next) => setDraft({ ...draft, employee: next })}
              onInvalid={setHoursInvalid}
            />
            <AvailabilityEditor
              name={draft.employee.name}
              availability={draft.availability}
              onChange={(availability) => setDraft({ ...draft, availability })}
            />
            <ConflictList rows={conflicts} onOpenDay={(weekId, date) => requestLeave(() => openDay(weekId, date))} />
            <ExceptionEditor
              employeeId={draft.employee.id}
              name={draft.employee.name}
              exceptions={draft.exceptions}
              onChange={(exceptions) => setDraft({ ...draft, exceptions })}
              nextId={() => {
                draftIds.current += 1
                return `draft-${draftIds.current}`
              }}
            />
          </>
        ) : (
          <>
            <ProfileView employee={saved.employee} />
            <AvailabilityView availability={saved.availability} />
            <ConflictList rows={conflicts} onOpenDay={(weekId, date) => requestLeave(() => openDay(weekId, date))} />
            <ExceptionView exceptions={saved.exceptions} />
          </>
        )}
      </fieldset>
      {ask ? (
        <div ref={askPanel} className="callout blue personal-note" role="group" aria-labelledby="save-question">
          <Info size={20} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <strong id="save-question">Änderungen speichern?</strong>
            <p>
              {leaveIntent === "edit"
                ? `Die Änderungen an ${employee.name} sind noch nicht gespeichert. Sollen sie übernommen werden?`
                : `Die Änderungen an ${employee.name} sind noch nicht gespeichert. Sollen sie übernommen werden, bevor das Fenster schließt?`}
            </p>
            {blocked ? <p>{nameInvalid ? "Der Name darf nicht leer sein. Speichern bleibt gesperrt, bis ein Name steht." : "Die Stunden sind noch nicht gültig. Speichern bleibt gesperrt, bis die Eingabe passt."}</p> : null}
            <div className="request-actions">
              <ActionButton action="cancel" variant="soft" onClick={() => { setAsk(false); pending.current = undefined }} />
              <ActionButton action="discard" variant="soft" onClick={discardAndLeave} />
              <ActionButton action="save" variant="dark" disabled={blocked} onClick={saveAndLeave} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function mergedExceptions(state: PersonalState, employeeId: string, own: readonly AvailabilityException[]): AvailabilityException[] {
  return [...state.exceptions.filter((item) => item.employeeId !== employeeId), ...own]
}

function conflictRows(weeks: readonly PlanWeek[], state: PersonalState, employeeId: string, availability: Availability, exceptions: readonly AvailabilityException[]) {
  return weeks.flatMap((week) =>
    (state.plans[week.id]?.shifts ?? [])
      .filter((shift) => shift.employeeId === employeeId)
      .map((shift) => ({ week, shift, fit: checkAvailability(availability, exceptions, employeeId, shift.date, shift.start, shift.end) }))
      .filter((item) => !item.fit.ok),
  )
}

function ProfileView({ employee }: { employee: Employee }) {
  const skills = skillKeys.filter((skill) => employee.skills[skill])
  return (
    <section className="personal-section" aria-label="Profil">
      <dl className="personal-person-facts">
        <div>
          <dt>Rolle</dt>
          <dd>{roleLabels[employee.role]}</dd>
        </div>
        <div>
          <dt>Priorität</dt>
          <dd>{priorityLabels[employee.priority]}</dd>
        </div>
        <div>
          <dt>Soll</dt>
          <dd>{employee.targetHours} Std./Woche</dd>
        </div>
        <div>
          <dt>Höchstens</dt>
          <dd>{employee.maxHours} Std./Woche</dd>
        </div>
      </dl>
      <div className="personal-pills">
        {skills.length > 0 ? skills.map((skill) => <Pill key={skill}>{skillLabels[skill]}</Pill>) : <Pill>Keine Zusatzfähigkeit</Pill>}
      </div>
    </section>
  )
}

function AvailabilityView({ availability }: { availability: Availability }) {
  return (
    <section className="personal-section" aria-label="Regelmäßige Verfügbarkeit">
      <div className="section-head">
        <h2>Regelmäßige Verfügbarkeit</h2>
      </div>
      <div className="personal-availability-grid-wrap">
        <table className="personal-availability-grid">
          <thead>
            <tr>
              {weekdayKeys.map((key) => (
                <th key={key} scope="col">{dayNames[key]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {weekdayKeys.map((key) => {
                const day = availability[key]
                return (
                  <td key={key} data-available={day.available ? "true" : "false"}>
                    {day.available ? compactRange(day.from, day.to) : "nicht verfügbar"}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ExceptionView({ exceptions }: { exceptions: readonly AvailabilityException[] }) {
  return (
    <section className="personal-section" aria-label="Ausnahmen">
      <div className="section-head">
        <h2>Ausnahmen</h2>
        <Pill>{exceptions.length === 0 ? "Keine" : exceptions.length === 1 ? "1 Eintrag" : `${exceptions.length} Einträge`}</Pill>
      </div>
      {exceptions.length === 0 ? (
        <div className="empty-state personal-empty">
          <h3>Keine Ausnahmen eingetragen</h3>
          <p>Urlaub und einzelne freie Tage erscheinen hier.</p>
        </div>
      ) : (
        <ul className="personal-read-list">
          {exceptions.map((item) => (
            <li key={item.id}>
              <span>{formatExceptionRange(item.startDate, item.endDate)}</span>
              <Pill tone={item.kind === "urlaub" ? "blue" : "amber"}>{exceptionLabels[item.kind]}</Pill>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ProfileEditor({
  employee,
  onEmployee,
  onInvalid,
}: {
  employee: Employee
  onEmployee: (employee: Employee) => void
  onInvalid: (invalid: boolean) => void
}) {
  const [target, setTarget] = useState(String(employee.targetHours))
  const [max, setMax] = useState(String(employee.maxHours))
  const parsedTarget = parseHours(target)
  const parsedMax = parseHours(max)
  let error: string | null = null
  if (parsedTarget === null || parsedMax === null) error = "Stunden bitte als ganze Zahl von 0 bis 99 angeben."
  else if (parsedMax < 1) error = "Die Höchststunden müssen mindestens 1 betragen."
  else if (parsedTarget > parsedMax) error = "Die Soll-Stunden dürfen die Höchststunden nicht übersteigen."

  useEffect(() => {
    onInvalid(Boolean(error))
  }, [error, onInvalid])

  function changeHours(nextTarget: string, nextMax: string) {
    setTarget(nextTarget)
    setMax(nextMax)
    const a = parseHours(nextTarget)
    const b = parseHours(nextMax)
    if (a !== null && b !== null && b >= 1 && a <= b) onEmployee({ ...employee, targetHours: a, maxHours: b })
  }

  function setSkill(skill: SkillKey, value: boolean) {
    onEmployee({ ...employee, skills: { ...employee.skills, [skill]: value } })
  }

  const cleaning = employee.skills.reinigung
  return (
    <section className="personal-section" aria-label="Profil">
      <div className="section-head">
        <h2>Profil</h2>
      </div>
      <div className="personal-form">
        <div className="personal-form-row">
          <div className="personal-field">
            <span className="personal-field-label">Rolle</span>
            <GlideSelect
              className="personal-select"
              options={roleOptions}
              value={employee.role}
              onChange={(value) => onEmployee({ ...employee, role: value as Role })}
              showTags={false}
              size="md"
              ariaLabel={`Rolle von ${employee.name}`}
            />
          </div>
          <div className="personal-field">
            <span className="personal-field-label">Priorität bei der Planung</span>
            <SegmentNav
              label={`Priorität von ${employee.name}`}
              value={employee.priority}
              onChange={(value) => onEmployee({ ...employee, priority: value })}
              items={priorityItems}
            />
          </div>
        </div>
        <div className="personal-form-row">
          <NumberField label="Soll-Stunden pro Woche" value={target} onChange={(value) => changeHours(value, max)} min={0} max={99} suffix="Std." invalid={Boolean(error)} />
          <NumberField label="Höchststunden pro Woche" value={max} onChange={(value) => changeHours(target, value)} min={1} max={99} suffix="Std." invalid={Boolean(error)} />
        </div>
        {error ? (
          <p className="personal-field-error" role="alert">
            {error}
          </p>
        ) : null}
        <fieldset className="personal-skills">
          <legend className="personal-field-label">Fähigkeiten</legend>
          {skillKeys.map((skill) => (
            <label key={skill} className="personal-check">
              <Checkbox checked={employee.skills[skill]} onCheckedChange={(value) => setSkill(skill, value === true)} />
              <span>{skillLabels[skill]}</span>
            </label>
          ))}
        </fieldset>
        <p className="personal-field-hint">
          {cleaning
            ? `${employee.name} wird nach dem Speichern für Toilettenkontrolle und wiederkehrende Reinigungsdienste eingeplant.`
            : `${employee.name} wird nach dem Speichern nicht für Reinigungsdienste eingeplant. Ohne andere Person mit dieser Fähigkeit meldet die Planprüfung einen offenen Punkt.`}
          {employee.role === "reinigungskraft" ? " Reinigungskräfte zählen nicht zur Besetzung im Gästebetrieb." : ""}
        </p>
      </div>
    </section>
  )
}

function parseHours(value: string): number | null {
  if (!/^\d{1,2}$/.test(value.trim())) return null
  return Number(value)
}

function AvailabilityEditor({
  name,
  availability,
  onChange,
}: {
  name: string
  availability: Availability
  onChange: (availability: Availability) => void
}) {
  const [weekday, setWeekday] = useState<WeekdayKey>("mo")
  const day = availability[weekday]
  return (
    <section className="personal-section" aria-label="Regelmäßige Verfügbarkeit">
      <div className="section-head">
        <h2>Regelmäßige Verfügbarkeit</h2>
      </div>
      <div className="personal-compact-row">
        <Field label="Tag">
          <GlideSelect
            className="personal-select"
            options={weekdayOptions}
            value={weekday}
            onChange={(value) => setWeekday(value as WeekdayKey)}
            showTags={false}
            size="md"
            ariaLabel="Wochentag"
          />
        </Field>
        <label className="personal-check">
          <Checkbox
            checked={day.available}
            onCheckedChange={(value) => onChange({ ...availability, [weekday]: { ...day, available: value === true } })}
          />
          <span>Verfügbar</span>
        </label>
        {day.available ? (
          <>
            <Field label="Von">
              <HourSelect
                label={`Verfügbar von, ${dayNames[weekday]}`}
                from={6}
                to={22}
                value={day.from}
                onChange={(from) => onChange({ ...availability, [weekday]: { ...day, from, to: Math.max(day.to, from + 60) } })}
              />
            </Field>
            <Field label="Bis">
              <HourSelect
                label={`Verfügbar bis, ${dayNames[weekday]}`}
                from={Math.floor(day.from / 60) + 1}
                to={23}
                value={day.to}
                onChange={(to) => onChange({ ...availability, [weekday]: { ...day, to } })}
              />
            </Field>
          </>
        ) : (
          <p className="personal-field-hint">{name} wird am {dayNames[weekday]} nicht eingeplant. Eine Schicht an diesem Tag erzeugt nach dem Speichern einen Hinweis im Dienstplan.</p>
        )}
      </div>
    </section>
  )
}

function ConflictList({
  rows,
  onOpenDay,
}: {
  rows: ReturnType<typeof conflictRows>
  onOpenDay: (weekId: string, date: string) => void
}) {
  if (rows.length === 0) return null
  return (
    <div className="callout blue personal-issues" role="status">
      <Info size={22} strokeWidth={1.8} aria-hidden="true" />
      <div>
        <strong>{rows.length === 1 ? "1 Schicht liegt außerhalb der Verfügbarkeit" : `${rows.length} Schichten liegen außerhalb der Verfügbarkeit`}</strong>
        <ul className="personal-issue-list">
          {rows.map(({ week, shift, fit }) => (
            <li key={shift.id}>
              <span className="personal-issue-text">
                {formatWeekdayShort(shift.date)}, {formatShortDate(shift.date)} {formatRange(shift.start, shift.end)}: {fit.ok ? "" : fit.reason}
              </span>
              <JellyButton variant="soft" onClick={() => onOpenDay(week.id, shift.date)}>
                Im Dienstplan ansehen
              </JellyButton>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function ExceptionEditor({
  employeeId,
  name,
  exceptions,
  onChange,
  nextId,
}: {
  employeeId: string
  name: string
  exceptions: AvailabilityException[]
  onChange: (exceptions: AvailabilityException[]) => void
  nextId: () => string
}) {
  const [kind, setKind] = useState<ExceptionKind>("ganztags")
  const [startDate, setStartDate] = useState(addDays(DEMO_DATE, 2))
  const [endDate, setEndDate] = useState(addDays(DEMO_DATE, 2))
  const effectiveEnd = kind === "urlaub" ? (endDate < startDate ? startDate : endDate) : startDate
  const overlap = exceptions.some((item) => item.startDate <= effectiveEnd && startDate <= item.endDate)

  function addException() {
    if (overlap) return
    const next = [...exceptions, { id: nextId(), employeeId, startDate, endDate: effectiveEnd, kind }]
    next.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id))
    onChange(next)
  }

  return (
    <section className="personal-section" aria-label="Ausnahmen">
      <div className="section-head">
        <h2>Ausnahmen</h2>
        <Pill>{exceptions.length === 0 ? "Keine" : exceptions.length === 1 ? "1 Eintrag" : `${exceptions.length} Einträge`}</Pill>
      </div>
      <div className="personal-compact-row">
        <DateField label={kind === "urlaub" ? "Von" : "Datum"} value={startDate} min={DEMO_DATE} onChange={(next) => { setStartDate(next); if (endDate < next) setEndDate(next) }} />
        <Field label="Art">
          <GlideSelect className="personal-select" options={kindOptions} value={kind} onChange={(next) => setKind(next as ExceptionKind)} showTags={false} size="md" ariaLabel="Art der Ausnahme" />
        </Field>
        {kind === "urlaub" ? <DateField label="Bis" value={effectiveEnd} min={startDate} onChange={setEndDate} /> : null}
        <ActionButton action="add" variant="dark" disabled={overlap} onClick={addException} />
      </div>
      {overlap ? (
        <p className="personal-field-error" role="alert">
          Für diesen Zeitraum besteht bereits eine Ausnahme von {name}.
        </p>
      ) : null}
      {exceptions.length === 0 ? (
        <div className="empty-state personal-empty">
          <h3>Keine Ausnahmen eingetragen</h3>
          <p>Urlaub und einzelne freie Tage erscheinen hier und gelten nach dem Speichern.</p>
        </div>
      ) : (
        <ul className="personal-exception-list">
          {exceptions.map((item) => (
            <li key={item.id}>
              <CalendarDays size={16} strokeWidth={1.8} aria-hidden="true" />
              <span>
                <strong>{formatExceptionRange(item.startDate, item.endDate)}</strong>
              </span>
              <Pill tone={item.kind === "urlaub" ? "blue" : "amber"}>{exceptionLabels[item.kind]}</Pill>
              <JellyButton
                variant="icon"
                className="personal-icon-button"
                aria-label={`Ausnahme ${formatExceptionRange(item.startDate, item.endDate)} entfernen`}
                onClick={() => onChange(exceptions.filter((entry) => entry.id !== item.id))}
              >
                <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
              </JellyButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
