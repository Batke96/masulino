"use client"

import { useId, useState, type ReactNode } from "react"
import { CalendarDays, Minus, Plus } from "lucide-react"
import { de } from "react-day-picker/locale"

import { Calendar } from "@/components/ui/calendar"
import { GlideSelect } from "@/components/ui/glide-select"
import { JellyButton } from "@/components/ui/jelly-button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatFullDate, formatTime, parseTime } from "@/lib/personal"

export type Tone = "neutral" | "green" | "orange" | "blue" | "amber"

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`pill ${tone === "neutral" ? "" : tone}`.trim()}>{children}</span>
}

const avatarTones = ["violet", "blue", "green", "amber", "orange"] as const

export function PersonAvatar({ name, index = 0, large = false }: { name: string; index?: number; large?: boolean }) {
  const initial = name.trim().split(" ").pop()?.slice(0, 1) ?? "?"
  return (
    <span className={`avatar ${avatarTones[index % avatarTones.length]} ${large ? "avatar-large" : ""}`.trim()} aria-hidden="true">
      {initial}
    </span>
  )
}

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string | null }) {
  return (
    <div className="personal-field">
      <span className="personal-field-label">{label}</span>
      {children}
      {error ? (
        <p className="personal-field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="personal-field-hint">{hint}</p>
      ) : null}
    </div>
  )
}

export function TimeField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (minute: number | null) => void
}) {
  const id = useId()
  const [draft, setDraft] = useState(value === null ? "" : formatTime(value))
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    if (value !== null && parseTime(draft) !== value) setDraft(formatTime(value))
  }
  const invalid = draft !== "" && parseTime(draft) === null
  return (
    <div className="personal-field">
      <label className="personal-field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="personal-input"
        inputMode="numeric"
        autoComplete="off"
        placeholder="08:45"
        maxLength={5}
        value={draft}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setDraft(event.target.value)
          onChange(parseTime(event.target.value))
        }}
        onBlur={() => {
          const parsed = parseTime(draft)
          if (parsed !== null) setDraft(formatTime(parsed))
        }}
      />
    </div>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  suffix,
  invalid,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  min?: number
  max?: number
  suffix?: string
  invalid?: boolean
}) {
  const id = useId()
  return (
    <div className="personal-field">
      <label className="personal-field-label" htmlFor={id}>
        {label}
      </label>
      <span className="personal-input-wrap">
        <input
          id={id}
          className="personal-input"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix ? <span className="personal-input-suffix">{suffix}</span> : null}
      </span>
    </div>
  )
}

export function HourSelect({
  value,
  onChange,
  from,
  to,
  label,
}: {
  value: number
  onChange: (minute: number) => void
  from: number
  to: number
  label: string
}) {
  const options: { value: string; label: string }[] = []
  for (let hour = from; hour <= to; hour += 1) options.push({ value: formatTime(hour * 60), label: formatTime(hour * 60) })
  if (!options.some((option) => option.value === formatTime(value))) {
    options.push({ value: formatTime(value), label: formatTime(value) })
    options.sort((a, b) => a.value.localeCompare(b.value))
  }
  return (
    <GlideSelect
      className="personal-select"
      options={options}
      value={formatTime(value)}
      onChange={(next) => {
        const minute = parseTime(next)
        if (minute !== null) onChange(minute)
      }}
      showTags={false}
      size="sm"
      ariaLabel={label}
    />
  )
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  label,
}: {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  label: string
}) {
  return (
    <div className="personal-stepper" role="group" aria-label={label}>
      <JellyButton variant="icon" aria-label={`${label} verringern`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <Minus size={16} strokeWidth={1.8} aria-hidden="true" />
      </JellyButton>
      <output aria-live="polite">{value}</output>
      <JellyButton variant="icon" aria-label={`${label} erhöhen`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
      </JellyButton>
    </div>
  )
}

function toDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year!, month! - 1, day!)
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function DateField({
  label,
  value,
  onChange,
  min,
}: {
  label: string
  value: string
  onChange: (iso: string) => void
  min?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="personal-field">
      <span className="personal-field-label">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <JellyButton variant="soft" className="personal-date-button" aria-label={`${label}: ${formatFullDate(value)}`}>
            <CalendarDays size={16} strokeWidth={1.8} aria-hidden="true" />
            {formatFullDate(value)}
          </JellyButton>
        </PopoverTrigger>
        <PopoverContent className="personal-calendar" align="start">
          <Calendar
            mode="single"
            locale={de}
            weekStartsOn={1}
            selected={toDate(value)}
            defaultMonth={toDate(value)}
            disabled={min ? { before: toDate(min) } : undefined}
            onSelect={(next) => {
              if (!next) return
              onChange(toIso(next))
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
