"use client"

import { useMemo, useState } from "react"
import { CalendarDays, CircleCheck, Info, Trash2 } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { GlideSelect } from "@/components/ui/glide-select"
import { JellyButton } from "@/components/ui/jelly-button"
import {
  DEMO_DATE,
  addDays,
  checkAvailability,
  compactRange,
  dayLabels,
  dayNames,
  exceptionLabels,
  formatExceptionRange,
  formatRange,
  formatShortDate,
  formatWeekdayShort,
  planWeeks,
  roleLabels,
  weekdayKeys,
  type ExceptionKind,
  type WeekdayKey,
} from "@/lib/personal"
import { usePersonal } from "./personal-context"
import { DateField, Field, HourSelect, PersonAvatar, Pill } from "./personal-ui"

const kindOptions = (Object.keys(exceptionLabels) as ExceptionKind[]).map((value) => ({ value, label: exceptionLabels[value] }))

export function VerfuegbarkeitTab() {
  const { state, dispatch, commit, availabilityEmployee, setAvailabilityEmployee, openDay } = usePersonal()
  const employee = state.employees.find((item) => item.id === availabilityEmployee) ?? state.employees[0]!
  const availability = state.availability[employee.id]
  const [weekday, setWeekday] = useState<WeekdayKey>("mo")
  const [kind, setKind] = useState<ExceptionKind>("ganztags")
  const [startDate, setStartDate] = useState(addDays(DEMO_DATE, 2))
  const [endDate, setEndDate] = useState(addDays(DEMO_DATE, 2))

  const employeeOptions = state.employees.map((item) => ({ value: item.id, label: `${item.name} · ${roleLabels[item.role]}` }))
  const own = useMemo(
    () => state.exceptions.filter((item) => item.employeeId === employee.id).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [state.exceptions, employee.id],
  )
  const conflicts = useMemo(
    () =>
      planWeeks.flatMap((week) =>
        (state.plans[week.id]?.shifts ?? [])
          .filter((shift) => shift.employeeId === employee.id)
          .map((shift) => ({ week, shift, fit: checkAvailability(state.availability[employee.id], state.exceptions, employee.id, shift.date, shift.start, shift.end) }))
          .filter((item) => !item.fit.ok),
      ),
    [state.plans, state.availability, state.exceptions, employee.id],
  )

  const effectiveEnd = kind === "urlaub" ? (endDate < startDate ? startDate : endDate) : startDate
  const overlap = own.some((item) => item.startDate <= effectiveEnd && startDate <= item.endDate)
  const day = availability?.[weekday]

  function addException() {
    if (overlap) return
    commit(
      { type: "addException", exception: { employeeId: employee.id, startDate, endDate: effectiveEnd, kind } },
      "Ausnahme eingetragen",
      { description: `${employee.name} · ${formatExceptionRange(startDate, effectiveEnd)} · ${exceptionLabels[kind]}` },
    )
  }

  return (
    <div className="personal-tab">
      <div className="personal-toolbar">
        <div className="personal-toolbar-person">
          <PersonAvatar name={employee.name} index={state.employees.indexOf(employee)} />
          <div className="personal-field">
            <span className="personal-field-label">Mitarbeiter</span>
            <GlideSelect className="personal-select" options={employeeOptions} value={employee.id} onChange={setAvailabilityEmployee} showTags={false} size="md" ariaLabel="Mitarbeiter wählen" />
          </div>
        </div>
        <Pill>Angaben für die Demo</Pill>
      </div>

      <section className="personal-section" aria-label="Regelmäßige Verfügbarkeit">
        <div className="section-head">
          <h2>Regelmäßige Verfügbarkeit</h2>
        </div>
        <div className="personal-weekdays" role="group" aria-label="Wochentag wählen">
          {weekdayKeys.map((key) => {
            const entry = availability?.[key]
            return (
              <button key={key} type="button" className="personal-weekday" data-selected={weekday === key} data-available={entry?.available ?? false} aria-pressed={weekday === key} aria-label={`${dayNames[key]}: ${entry?.available ? formatRange(entry.from, entry.to) : "nicht verfügbar"}`} onClick={() => setWeekday(key)}>
                <span className="personal-weekday-name">{dayLabels[key]}</span>
                <span className="personal-weekday-time">{entry?.available ? compactRange(entry.from, entry.to) : "–"}</span>
              </button>
            )
          })}
        </div>
        {day ? (
          <div className="personal-editor">
            <label className="personal-check">
              <Checkbox
                checked={day.available}
                onCheckedChange={(value) => dispatch({ type: "setAvailabilityDay", employeeId: employee.id, key: weekday, day: { ...day, available: value === true } })}
              />
              <span>Verfügbar am {dayNames[weekday]}</span>
            </label>
            {day.available ? (
              <div className="personal-form-row">
                <Field label="Von">
                  <HourSelect label={`Verfügbar von, ${dayNames[weekday]}`} from={6} to={22} value={day.from} onChange={(from) => dispatch({ type: "setAvailabilityDay", employeeId: employee.id, key: weekday, day: { ...day, from, to: Math.max(day.to, from + 60) } })} />
                </Field>
                <Field label="Bis">
                  <HourSelect label={`Verfügbar bis, ${dayNames[weekday]}`} from={Math.floor(day.from / 60) + 1} to={23} value={day.to} onChange={(to) => dispatch({ type: "setAvailabilityDay", employeeId: employee.id, key: weekday, day: { ...day, to } })} />
                </Field>
              </div>
            ) : (
              <p className="personal-field-hint">{employee.name} wird am {dayNames[weekday]} nicht eingeplant. Eine Schicht an diesem Tag erzeugt einen Hinweis im Dienstplan.</p>
            )}
          </div>
        ) : null}
      </section>

      {conflicts.length > 0 ? (
        <div className="callout blue personal-issues" role="status">
          <Info size={22} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <strong>{conflicts.length === 1 ? "1 Schicht liegt außerhalb der Verfügbarkeit" : `${conflicts.length} Schichten liegen außerhalb der Verfügbarkeit`}</strong>
            <ul className="personal-issue-list">
              {conflicts.map(({ week, shift, fit }) => (
                <li key={shift.id}>
                  <span className="personal-issue-text">
                    {formatWeekdayShort(shift.date)}, {formatShortDate(shift.date)} {formatRange(shift.start, shift.end)}: {fit.ok ? "" : fit.reason}
                  </span>
                  <JellyButton variant="soft" onClick={() => openDay(week.id, shift.date)}>
                    Im Dienstplan ansehen
                  </JellyButton>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="personal-ok">
          <CircleCheck size={16} strokeWidth={1.8} aria-hidden="true" />
          Alle geplanten Schichten von {employee.name} liegen innerhalb der Verfügbarkeit.
        </p>
      )}

      <section className="personal-section" aria-label="Ausnahmen">
        <div className="section-head">
          <h2>Ausnahmen</h2>
          <Pill>{own.length === 0 ? "Keine" : own.length === 1 ? "1 Eintrag" : `${own.length} Einträge`}</Pill>
        </div>
        <div className="personal-exception-form">
          <DateField label={kind === "urlaub" ? "Von" : "Datum"} value={startDate} min={DEMO_DATE} onChange={(next) => { setStartDate(next); if (endDate < next) setEndDate(next) }} />
          <Field label="Art">
            <GlideSelect className="personal-select" options={kindOptions} value={kind} onChange={(next) => setKind(next as ExceptionKind)} showTags={false} size="md" ariaLabel="Art der Ausnahme" />
          </Field>
          {kind === "urlaub" ? <DateField label="Bis" value={effectiveEnd} min={startDate} onChange={setEndDate} /> : null}
          <JellyButton disabled={overlap} onClick={addException} aria-describedby={overlap ? "exception-overlap" : undefined}>
            Ausnahme hinzufügen
          </JellyButton>
        </div>
        {overlap ? (
          <p className="personal-field-error" id="exception-overlap" role="alert">
            Für diesen Zeitraum besteht bereits eine Ausnahme von {employee.name}.
          </p>
        ) : null}
        {own.length === 0 ? (
          <div className="empty-state personal-empty">
            <h3>Keine Ausnahmen eingetragen</h3>
            <p>Urlaub und einzelne freie Tage erscheinen hier und wirken sofort auf die Planprüfung.</p>
          </div>
        ) : (
          <ul className="personal-exception-list">
            {own.map((item) => (
              <li key={item.id}>
                <CalendarDays size={16} strokeWidth={1.8} aria-hidden="true" />
                <span>
                  <strong>{formatExceptionRange(item.startDate, item.endDate)}</strong>
                </span>
                <Pill tone={item.kind === "urlaub" ? "blue" : "amber"}>{exceptionLabels[item.kind]}</Pill>
                <JellyButton
                  variant="icon" className="personal-icon-button"
                  aria-label={`Ausnahme ${formatExceptionRange(item.startDate, item.endDate)} entfernen`}
                  onClick={() => commit({ type: "removeException", id: item.id }, "Ausnahme entfernt", { description: `${employee.name} · ${formatExceptionRange(item.startDate, item.endDate)}` })}
                >
                  <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                </JellyButton>
              </li>
            ))}
          </ul>
        )}
        <p className="fine-print">Ausnahmen überschreiben die regelmäßige Verfügbarkeit. Es wird keine Nachricht an Mitarbeitende gesendet.</p>
      </section>
    </div>
  )
}
