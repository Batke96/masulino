"use client"

import { useMemo, useState } from "react"
import { CalendarClock, Pencil } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { GlideSelect } from "@/components/ui/glide-select"
import { JellyButton } from "@/components/ui/jelly-button"
import {
  compactRange,
  dayLabels,
  initialPersonalState,
  priorityLabels,
  roleLabels,
  skillKeys,
  skillLabels,
  weekdayKeys,
  type Employee,
  type Priority,
  type Role,
  type SkillKey,
} from "@/lib/personal"
import { usePersonal } from "./personal-context"
import { NumberField, PersonAvatar, Pill } from "./personal-ui"
import { SegmentNav } from "./segment-nav"

const skillShort: Record<SkillKey, string> = {
  kasse: "Kasse",
  reinigung: "Reinigung",
  oeffnung: "Öffnungsdienst",
  stosszeit: "Stoßzeiten",
}

const roleOptions = (Object.keys(roleLabels) as Role[]).map((value) => ({ value, label: roleLabels[value] }))
const priorityItems = (Object.keys(priorityLabels) as Priority[]).map((value) => ({ value, label: priorityLabels[value] }))

function sameEmployee(a: Employee, b: Employee | undefined): boolean {
  return Boolean(b) && JSON.stringify(a) === JSON.stringify(b)
}

export function MitarbeiterTab() {
  const { state, openAvailability, commit } = usePersonal()
  const baseline = useMemo(() => initialPersonalState().employees, [])
  const [editing, setEditing] = useState<string | null>(null)
  const [resetCount, setResetCount] = useState(0)

  return (
    <div className="personal-tab">
      <div className="section-head personal-head-row">
        <h2>Mitarbeitende</h2>
        <Pill>{state.employees.length} Profile · Beispieldaten</Pill>
      </div>
      <p className="fine-print personal-lead">
        Alle Namen sind fiktiv. Rolle, Stunden und Fähigkeiten steuern die Planprüfung und den Planvorschlag; Änderungen wirken sofort im Dienstplan.
      </p>
      <div className="personal-people">
        {state.employees.map((employee, index) => {
          const original = baseline.find((item) => item.id === employee.id)
          const changed = !sameEmployee(employee, original)
          const open = editing === employee.id
          const availability = state.availability[employee.id]
          const windows = weekdayKeys
            .map((key) => {
              const day = availability?.[key]
              return day?.available ? `${dayLabels[key]} ${compactRange(day.from, day.to)}` : null
            })
            .filter(Boolean)
          return (
            <article key={employee.id} className="surface personal-person" data-editing={open}>
              <div className="personal-person-head">
                <PersonAvatar name={employee.name} index={index} large />
                <div>
                  <h3>{employee.name}</h3>
                  <p>{roleLabels[employee.role]}</p>
                </div>
                {changed ? <Pill tone="blue">Geändert</Pill> : null}
              </div>
              <dl className="personal-person-facts">
                <div>
                  <dt>Soll</dt>
                  <dd>{employee.targetHours} Std./Woche</dd>
                </div>
                <div>
                  <dt>Höchstens</dt>
                  <dd>{employee.maxHours} Std./Woche</dd>
                </div>
                <div>
                  <dt>Priorität</dt>
                  <dd>{priorityLabels[employee.priority]}</dd>
                </div>
              </dl>
              <div className="personal-pills">
                {skillKeys.filter((skill) => employee.skills[skill]).map((skill) => (
                  <Pill key={skill} tone="green">{skillShort[skill]}</Pill>
                ))}
                {skillKeys.every((skill) => !employee.skills[skill]) ? <Pill>Keine Zusatzfähigkeit</Pill> : null}
              </div>
              <p className="personal-person-availability">
                <CalendarClock size={16} strokeWidth={1.8} aria-hidden="true" />
                {windows.length > 0 ? windows.join(" · ") : "Keine regelmäßige Verfügbarkeit"}
              </p>
              <div className="request-actions">
                <JellyButton variant="soft" aria-expanded={open} onClick={() => setEditing(open ? null : employee.id)}>
                  <Pencil size={16} strokeWidth={1.8} aria-hidden="true" />
                  {open ? "Schließen" : "Bearbeiten"}
                </JellyButton>
                <JellyButton variant="soft" onClick={() => openAvailability(employee.id)}>
                  Verfügbarkeit
                </JellyButton>
              </div>
              {open ? (
                <EmployeeEditor
                  key={`${employee.id}-${resetCount}`}
                  employee={employee}
                  changed={changed}
                  onReset={() => {
                    commit({ type: "resetEmployee", id: employee.id }, `${employee.name} zurückgesetzt`, { description: "Profil entspricht wieder den Beispieldaten." })
                    setResetCount((value) => value + 1)
                  }}
                  onDone={() => setEditing(null)}
                />
              ) : null}
            </article>
          )
        })}
      </div>
    </div>
  )
}

function parseHours(value: string): number | null {
  if (!/^\d{1,2}$/.test(value.trim())) return null
  return Number(value)
}

function EmployeeEditor({ employee, changed, onReset, onDone }: { employee: Employee; changed: boolean; onReset: () => void; onDone: () => void }) {
  const { dispatch } = usePersonal()
  const [target, setTarget] = useState(String(employee.targetHours))
  const [max, setMax] = useState(String(employee.maxHours))
  const parsedTarget = parseHours(target)
  const parsedMax = parseHours(max)
  let error: string | null = null
  if (parsedTarget === null || parsedMax === null) error = "Stunden bitte als ganze Zahl von 0 bis 99 angeben."
  else if (parsedMax < 1) error = "Die Höchststunden müssen mindestens 1 betragen."
  else if (parsedTarget > parsedMax) error = "Die Soll-Stunden dürfen die Höchststunden nicht übersteigen."

  function change(nextTarget: string, nextMax: string) {
    setTarget(nextTarget)
    setMax(nextMax)
    const a = parseHours(nextTarget)
    const b = parseHours(nextMax)
    if (a !== null && b !== null && b >= 1 && a <= b) dispatch({ type: "updateEmployee", id: employee.id, patch: { targetHours: a, maxHours: b } })
  }

  const cleaning = employee.skills.reinigung
  return (
    <div className="personal-editor">
      <div className="personal-form-row">
        <div className="personal-field">
          <span className="personal-field-label">Rolle</span>
          <GlideSelect
            className="personal-select"
            options={roleOptions}
            value={employee.role}
            onChange={(value) => dispatch({ type: "updateEmployee", id: employee.id, patch: { role: value as Role } })}
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
            onChange={(value) => dispatch({ type: "updateEmployee", id: employee.id, patch: { priority: value } })}
            items={priorityItems}
          />
        </div>
      </div>
      <div className="personal-form-row">
        <NumberField label="Soll-Stunden pro Woche" value={target} onChange={(value) => change(value, max)} min={0} max={99} suffix="Std." invalid={Boolean(error)} />
        <NumberField label="Höchststunden pro Woche" value={max} onChange={(value) => change(target, value)} min={1} max={99} suffix="Std." invalid={Boolean(error)} />
      </div>
      {error ? (
        <p className="personal-field-error" role="alert">
          {error} Die letzte gültige Eingabe bleibt im Plan wirksam.
        </p>
      ) : null}
      <fieldset className="personal-skills">
        <legend className="personal-field-label">Fähigkeiten</legend>
        {skillKeys.map((skill) => (
          <label key={skill} className="personal-check">
            <Checkbox checked={employee.skills[skill]} onCheckedChange={(value) => dispatch({ type: "setSkill", id: employee.id, skill, value: value === true })} />
            <span>{skillLabels[skill]}</span>
          </label>
        ))}
      </fieldset>
      <p className="personal-field-hint">
        {cleaning
          ? `${employee.name} wird für Toilettenkontrolle und wiederkehrende Reinigungsdienste eingeplant.`
          : `${employee.name} wird nicht für Reinigungsdienste eingeplant. Ohne andere Person mit dieser Fähigkeit meldet die Planprüfung einen offenen Punkt.`}
        {employee.role === "reinigungskraft" ? " Reinigungskräfte zählen nicht zur Besetzung im Gästebetrieb." : ""}
      </p>
      <div className="request-actions">
        <JellyButton onClick={onDone}>Fertig</JellyButton>
        {changed ? (
          <JellyButton variant="soft" onClick={onReset}>
            Zurücksetzen
          </JellyButton>
        ) : null}
      </div>
    </div>
  )
}
