"use client"

import { useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { GlideSelect } from "@/components/ui/glide-select"
import { JellyButton } from "@/components/ui/jelly-button"
import { Switch } from "@/components/ui/switch"
import {
  dayKeys,
  dayLabels,
  dayNames,
  formatRange,
  requiredHeadcount,
  ruleSummary,
  weekdayKeys,
  type CleaningService,
  type DayKey,
  type LeadRole,
  type LoadCondition,
  type WeekdayKey,
} from "@/lib/personal"
import { usePersonal } from "./personal-context"
import { Field, HourSelect, NumberField, Stepper, useFocusReturn } from "./personal-ui"
import { SegmentNav } from "./segment-nav"

const dayOptions = dayKeys.map((value) => ({ value, label: dayNames[value] }))
const leadItems: { value: LeadRole; label: string }[] = [
  { value: "none", label: "Keine Vorgabe" },
  { value: "schichtleiter", label: "Schichtleiter" },
  { value: "leitung", label: "Leitung" },
]
const leadLabel: Record<LeadRole, string> = { none: "keine Leitung nötig", schichtleiter: "Schichtleiter nötig", leitung: "Leitung nötig" }

function conditionText(condition: LoadCondition): string {
  const window = condition.from !== undefined && condition.to !== undefined ? formatRange(condition.from, condition.to) : "ganztägig"
  return `${dayNames[condition.day]} · ab ${condition.fromGuests} Gästen · +${condition.extra} ${condition.extra === 1 ? "Person" : "Personen"} · ${window}`
}

export function RegelnTab() {
  return (
    <div className="personal-tab">
      <p className="fine-print personal-lead">
        Diese Regeln steuern die Planprüfung und den Planvorschlag. Änderungen gelten sofort für alle Wochen. Es sind Annahmen der Demo und keine freigegebene Betriebsvorgabe.
      </p>
      <DayRules />
      <LoadConditions />
      <Openings />
      <CleaningServices />
    </div>
  )
}

function DayRules() {
  const { state, dispatch } = usePersonal()
  const [selected, setSelected] = useState<DayKey>("sa")
  const rule = state.rules.days[selected]
  return (
    <section className="personal-section" aria-label="Grundbesetzung">
      <div className="section-head">
        <h2>1 · Grundbesetzung je Tag</h2>
      </div>
      <div className="personal-weekdays personal-weekdays-eight" role="group" aria-label="Tag der Regel wählen">
        {dayKeys.map((key) => (
          <button key={key} type="button" className="personal-weekday" data-selected={selected === key} data-available="true" aria-pressed={selected === key} aria-label={`${dayNames[key]}: ${ruleSummary(state.rules.days[key])}`} onClick={() => setSelected(key)}>
            <span className="personal-weekday-name">{dayLabels[key]}</span>
            <span className="personal-weekday-time">{state.rules.days[key].min === state.rules.days[key].max ? state.rules.days[key].min : `${state.rules.days[key].min}–${state.rules.days[key].max}`}</span>
          </button>
        ))}
      </div>
      <div className="personal-editor">
        <h3 className="personal-subhead">{dayNames[selected]}</h3>
        <div className="personal-form-row">
          <Field label="Mindestens im Dienst">
            <Stepper label="Mindestbesetzung" value={rule.min} min={0} max={9} onChange={(min) => dispatch({ type: "setDayRule", key: selected, patch: { min } })} />
          </Field>
          <Field label="Höchstens im Dienst">
            <Stepper label="Höchstbesetzung" value={rule.max} min={rule.min} max={9} onChange={(max) => dispatch({ type: "setDayRule", key: selected, patch: { max } })} />
          </Field>
        </div>
        <Field label="Leitung im Dienst">
          <SegmentNav label="Leitung im Dienst" value={rule.leadRole} onChange={(leadRole) => dispatch({ type: "setDayRule", key: selected, patch: { leadRole } })} items={leadItems} />
        </Field>
        <label className="personal-check">
          <Checkbox checked={rule.requireKasse} onCheckedChange={(value) => dispatch({ type: "setDayRule", key: selected, patch: { requireKasse: value === true } })} />
          <span>Jemand mit Kassen-Fähigkeit ist immer im Dienst</span>
        </label>
        <label className="personal-check">
          <Checkbox checked={rule.requireReinigung} onCheckedChange={(value) => dispatch({ type: "setDayRule", key: selected, patch: { requireReinigung: value === true } })} />
          <span>Toilettenkontrolle und -reinigung ist am Tag besetzt</span>
        </label>
        <p className="personal-field-hint">
          {dayNames[selected]}: {ruleSummary(rule)}, {leadLabel[rule.leadRole]}.
          {selected === "feiertag" ? " Diese Regel gilt an Feiertagen anstelle des Wochentags, solange die Feiertagsregel unten aktiv ist." : ""}
        </p>
      </div>
    </section>
  )
}

function LoadConditions() {
  const { state, commit } = usePersonal()
  const [draft, setDraft] = useState<(Omit<LoadCondition, "id"> & { id?: string }) | null>(null)
  const { rules } = state
  return (
    <section className="personal-section" aria-label="Hohe Auslastung">
      <div className="section-head">
        <h2>2 · Zusatzbedarf bei hoher Auslastung</h2>
        <JellyButton variant="soft" onClick={() => setDraft({ day: "sa", fromGuests: 80, extra: 1 })}>
          <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
          Bedingung hinzufügen
        </JellyButton>
      </div>
      {rules.conditions.length === 0 ? (
        <div className="empty-state personal-empty">
          <h3>Keine Bedingungen</h3>
          <p>Ohne Bedingung gilt immer die Grundbesetzung des Tages.</p>
        </div>
      ) : (
        <ul className="personal-rule-list">
          {rules.conditions.map((condition) => (
            <li key={condition.id}>
              <span>{conditionText(condition)}</span>
              <span className="personal-shift-actions">
                <JellyButton variant="icon" className="personal-icon-button" aria-label={`Bedingung bearbeiten: ${conditionText(condition)}`} onClick={() => setDraft(condition)}>
                  <Pencil size={16} strokeWidth={1.8} aria-hidden="true" />
                </JellyButton>
                <JellyButton variant="icon" className="personal-icon-button" aria-label={`Bedingung entfernen: ${conditionText(condition)}`} onClick={() => commit({ type: "removeCondition", id: condition.id }, "Bedingung entfernt", { description: conditionText(condition) })}>
                  <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                </JellyButton>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="fine-print">Treffen mehrere Bedingungen zu, zählt nur die höchste Zusatzbesetzung. Die Höchstbesetzung des Tages bleibt die Grenze.</p>
      <RuleTester />
      <ConditionDialog draft={draft} onClose={() => setDraft(null)} />
    </section>
  )
}

function RuleTester() {
  const { state } = usePersonal()
  const [day, setDay] = useState<DayKey>("sa")
  const [guests, setGuests] = useState("110")
  const [minute, setMinute] = useState(12 * 60)
  const count = /^\d{1,3}$/.test(guests.trim()) ? Number(guests) : null
  const result = count === null ? null : requiredHeadcount(state.rules, day, count, minute)
  return (
    <div className="personal-tester" role="group" aria-label="Regeltest">
      <h3 className="personal-subhead">Regel testen</h3>
      <div className="personal-form-row personal-tester-fields">
        <Field label="Wochentag">
          <GlideSelect className="personal-select" options={dayOptions} value={day} onChange={(next) => setDay(next as DayKey)} showTags={false} size="md" ariaLabel="Wochentag testen" />
        </Field>
        <NumberField label="Erwartete Gäste" value={guests} onChange={setGuests} min={0} max={999} invalid={count === null} />
        <Field label="Uhrzeit">
          <HourSelect label="Uhrzeit testen" from={10} to={18} value={minute} onChange={setMinute} />
        </Field>
      </div>
      {result ? (
        <dl className="personal-tester-result" aria-live="polite">
          <div>
            <dt>Grundbesetzung</dt>
            <dd>{result.base}</dd>
            <small>{dayNames[day]}</small>
          </div>
          <div>
            <dt>Zusatzbedarf</dt>
            <dd>+{result.extra}</dd>
            <small>{result.condition ? conditionText(result.condition) : "Keine Bedingung trifft zu"}</small>
          </div>
          <div data-strong="true">
            <dt>Nach Deckelung</dt>
            <dd>{result.capped}</dd>
            <small>{result.capReached ? `Obergrenze von ${state.rules.days[day].max} erreicht (rechnerisch ${result.uncapped})` : "Innerhalb der Obergrenze"}</small>
          </div>
        </dl>
      ) : (
        <p className="personal-field-error" role="alert">
          Bitte die erwarteten Gäste als Zahl angeben.
        </p>
      )}
    </div>
  )
}

function ConditionDialog({ draft, onClose }: { draft: (Omit<LoadCondition, "id"> & { id?: string }) | null; onClose: () => void }) {
  const focusReturn = useFocusReturn()
  return (
    <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent showCloseButton={false} className="article-dialog personal-dialog" {...focusReturn}>
        {draft ? <ConditionForm key={draft.id ?? "neu"} draft={draft} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function ConditionForm({ draft, onClose }: { draft: Omit<LoadCondition, "id"> & { id?: string }; onClose: () => void }) {
  const { commit } = usePersonal()
  const [day, setDay] = useState<DayKey>(draft.day)
  const [guests, setGuests] = useState(String(draft.fromGuests))
  const [extra, setExtra] = useState(draft.extra)
  const [windowed, setWindowed] = useState(draft.from !== undefined && draft.to !== undefined)
  const [from, setFrom] = useState(draft.from ?? 11 * 60)
  const [to, setTo] = useState(draft.to ?? 15 * 60)
  const count = /^\d{1,3}$/.test(guests.trim()) ? Number(guests) : null
  let error: string | null = null
  if (count === null || count < 1) error = "Bitte eine Gästezahl von 1 bis 999 angeben."
  else if (windowed && to <= from) error = "Das Zeitfenster muss nach dem Beginn enden."

  function save() {
    if (error || count === null) return
    const condition = { id: draft.id, day, fromGuests: count, extra, ...(windowed ? { from, to } : {}) }
    commit({ type: "saveCondition", condition }, draft.id ? "Bedingung gespeichert" : "Bedingung hinzugefügt", { description: conditionText({ ...condition, id: draft.id ?? "neu" }) })
    onClose()
  }

  return (
    <>
      <DialogTitle>{draft.id ? "Bedingung bearbeiten" : "Bedingung hinzufügen"}</DialogTitle>
      <DialogDescription>Ab dieser Gästezahl kommt Personal zur Grundbesetzung hinzu.</DialogDescription>
      <div className="personal-form">
        <Field label="Wochentag">
          <GlideSelect className="personal-select" options={dayOptions} value={day} onChange={(next) => setDay(next as DayKey)} showTags={false} size="md" ariaLabel="Wochentag der Bedingung" />
        </Field>
        <NumberField label="Ab erwarteten Gästen" value={guests} onChange={setGuests} min={1} max={999} invalid={count === null || count < 1} />
        <Field label="Zusätzliche Personen">
          <Stepper label="Zusätzliche Personen" value={extra} min={1} max={5} onChange={setExtra} />
        </Field>
        <label className="personal-check">
          <Checkbox checked={windowed} onCheckedChange={(value) => setWindowed(value === true)} />
          <span>Nur in einem Zeitfenster</span>
        </label>
        {windowed ? (
          <div className="personal-form-row">
            <Field label="Von">
              <HourSelect label="Zeitfenster von" from={10} to={18} value={from} onChange={setFrom} />
            </Field>
            <Field label="Bis">
              <HourSelect label="Zeitfenster bis" from={11} to={19} value={to} onChange={setTo} />
            </Field>
          </div>
        ) : null}
      </div>
      {error ? (
        <p className="personal-field-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="request-actions personal-dialog-actions">
        <JellyButton variant="soft" onClick={onClose}>
          Abbrechen
        </JellyButton>
        <JellyButton disabled={Boolean(error)} onClick={save}>
          Speichern
        </JellyButton>
      </div>
    </>
  )
}

function Openings() {
  const { state, commit, dispatch } = usePersonal()
  const { rules } = state
  const leadItemsList = [0, 15, 30, 45, 60].map((value) => ({ value: String(value), label: `${value} Min.` }))
  return (
    <section className="personal-section" aria-label="Sonderöffnungen und Feiertage">
      <div className="section-head">
        <h2>3 · Sonderöffnungen und Feiertage</h2>
      </div>
      <ul className="personal-toggle-list">
        <li>
          <div>
            <strong id="rule-special">Sonderöffnungen automatisch erkennen</strong>
            <p>Eine Kita- oder Schulbuchung vor 10:00 Uhr gilt als Sonderöffnung. Die Planprüfung verlangt dann eine Frühschicht.</p>
          </div>
          <Switch aria-labelledby="rule-special" checked={rules.autoSpecialOpenings} onCheckedChange={(value) => commit({ type: "setRuleFlags", patch: { autoSpecialOpenings: value } }, value ? "Sonderöffnungen werden erkannt" : "Sonderöffnungen werden ignoriert")} />
        </li>
        <li>
          <div>
            <strong id="rule-lead">Frühschicht beginnt vor der Öffnung</strong>
            <p>So viel früher als die gebuchte Öffnung muss die Schicht beginnen.</p>
            <SegmentNav label="Vorlaufzeit der Frühschicht" value={String(rules.specialOpeningLead)} onChange={(value) => dispatch({ type: "setRuleFlags", patch: { specialOpeningLead: Number(value) } })} items={leadItemsList} />
          </div>
        </li>
        <li>
          <div>
            <strong id="rule-holiday">Feiertagsregel hat Vorrang</strong>
            <p>An Feiertagen gilt die Grundbesetzung „Feiertag“ statt der des Wochentags.</p>
          </div>
          <Switch aria-labelledby="rule-holiday" checked={rules.holidayRuleFirst} onCheckedChange={(value) => commit({ type: "setRuleFlags", patch: { holidayRuleFirst: value } }, value ? "Feiertagsregel hat Vorrang" : "Wochentagsregel gilt auch an Feiertagen")} />
        </li>
      </ul>
    </section>
  )
}

function serviceDays(service: CleaningService): string {
  if (service.days.length === 7) return "täglich"
  if (service.days.join() === "mo,di,mi,do,fr") return "Mo–Fr"
  return service.days.map((day) => dayLabels[day]).join(", ")
}

function CleaningServices() {
  const { state, commit, dispatch } = usePersonal()
  const [draft, setDraft] = useState<(Omit<CleaningService, "id"> & { id?: string }) | null>(null)
  return (
    <section className="personal-section" aria-label="Reinigungsdienste">
      <div className="section-head">
        <h2>4 · Wiederkehrende Reinigungsdienste</h2>
        <JellyButton variant="soft" onClick={() => setDraft({ label: "", days: ["mo", "di", "mi", "do", "fr"], start: 8 * 60, end: 10 * 60, enabled: true })}>
          <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
          Dienst hinzufügen
        </JellyButton>
      </div>
      {state.rules.cleaning.length === 0 ? (
        <div className="empty-state personal-empty">
          <h3>Keine Reinigungsdienste</h3>
          <p>Reinigungsdienste außerhalb der Öffnungszeiten erscheinen im Dienstplan als eigene Schichten.</p>
        </div>
      ) : (
        <ul className="personal-rule-list">
          {state.rules.cleaning.map((service) => (
            <li key={service.id}>
              <span>
                <strong>{service.label}</strong>
                <small className="personal-rule-sub">
                  {serviceDays(service)} · {formatRange(service.start, service.end)}
                </small>
              </span>
              <span className="personal-shift-actions">
                <Switch aria-label={`${service.label} aktiv`} checked={service.enabled} onCheckedChange={(value) => dispatch({ type: "saveCleaning", service: { ...service, enabled: value } })} />
                <JellyButton variant="icon" className="personal-icon-button" aria-label={`${service.label} bearbeiten`} onClick={() => setDraft(service)}>
                  <Pencil size={16} strokeWidth={1.8} aria-hidden="true" />
                </JellyButton>
                <JellyButton variant="icon" className="personal-icon-button" aria-label={`${service.label} entfernen`} onClick={() => commit({ type: "removeCleaning", id: service.id }, "Reinigungsdienst entfernt", { description: service.label })}>
                  <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                </JellyButton>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="fine-print">Aktive Dienste verlangen an den gewählten Tagen eine Reinigungsschicht mit passender Fähigkeit. Der Planvorschlag trägt sie ein, wenn jemand verfügbar ist.</p>
      <CleaningDialog draft={draft} onClose={() => setDraft(null)} />
    </section>
  )
}

function CleaningDialog({ draft, onClose }: { draft: (Omit<CleaningService, "id"> & { id?: string }) | null; onClose: () => void }) {
  const focusReturn = useFocusReturn()
  return (
    <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent showCloseButton={false} className="article-dialog personal-dialog" {...focusReturn}>
        {draft ? <CleaningForm key={draft.id ?? "neu"} draft={draft} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function CleaningForm({ draft, onClose }: { draft: Omit<CleaningService, "id"> & { id?: string }; onClose: () => void }) {
  const { commit } = usePersonal()
  const [label, setLabel] = useState(draft.label)
  const [days, setDays] = useState<WeekdayKey[]>(draft.days)
  const [start, setStart] = useState(draft.start)
  const [end, setEnd] = useState(draft.end)
  let error: string | null = null
  if (!label.trim()) error = "Bitte eine Bezeichnung angeben."
  else if (days.length === 0) error = "Bitte mindestens einen Wochentag wählen."
  else if (end <= start) error = "Das Ende muss nach dem Beginn liegen."

  return (
    <>
      <DialogTitle>{draft.id ? "Reinigungsdienst bearbeiten" : "Reinigungsdienst hinzufügen"}</DialogTitle>
      <DialogDescription>Der Dienst wiederholt sich an den gewählten Wochentagen.</DialogDescription>
      <div className="personal-form">
        <div className="personal-field">
          <label className="personal-field-label" htmlFor="cleaning-label">
            Bezeichnung
          </label>
          <input id="cleaning-label" className="personal-input" value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} />
        </div>
        <fieldset className="personal-skills personal-days-check">
          <legend className="personal-field-label">Wochentage</legend>
          {weekdayKeys.map((key) => (
            <label key={key} className="personal-check">
              <Checkbox checked={days.includes(key)} onCheckedChange={(value) => setDays(weekdayKeys.filter((item) => (item === key ? value === true : days.includes(item))))} />
              <span>{dayLabels[key]}</span>
            </label>
          ))}
        </fieldset>
        <div className="personal-form-row">
          <Field label="Von">
            <HourSelect label="Reinigung von" from={6} to={21} value={start} onChange={(next) => { setStart(next); if (end <= next) setEnd(next + 60) }} />
          </Field>
          <Field label="Bis">
            <HourSelect label="Reinigung bis" from={Math.floor(start / 60) + 1} to={22} value={end} onChange={setEnd} />
          </Field>
        </div>
      </div>
      {error ? (
        <p className="personal-field-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="request-actions personal-dialog-actions">
        <JellyButton variant="soft" onClick={onClose}>
          Abbrechen
        </JellyButton>
        <JellyButton
          disabled={Boolean(error)}
          onClick={() => {
            if (error) return
            commit({ type: "saveCleaning", service: { id: draft.id, label: label.trim(), days, start, end, enabled: draft.enabled } }, draft.id ? "Reinigungsdienst gespeichert" : "Reinigungsdienst hinzugefügt", { description: label.trim() })
            onClose()
          }}
        >
          Speichern
        </JellyButton>
      </div>
    </>
  )
}
