"use client"

import type { ReactNode } from "react"

import { GlideSelect } from "@/components/ui/glide-select"
import { JellyRadio } from "@/components/ui/jelly-radio"

export const jellyTone = {
  chipColor: "var(--muted)",
  activeColor: "var(--ink)",
  textColor: "var(--text-secondary)",
  activeTextColor: "var(--primary-foreground)",
} as const

export const jellyMotion = {
  size: "md",
  gap: 8,
  radius: 18,
  swell: 0,
  barge: 0,
  shrink: 0,
  jelly: 0.15,
  bounce: 0.05,
  stagger: 6,
  stiffness: 780,
} as const

export type SegmentItem<T extends string> = { value: T; label: string; icon?: ReactNode; disabled?: boolean }

export function SegmentNav<T extends string>({
  items,
  value,
  onChange,
  label,
  align = "left",
  className = "",
}: {
  items: SegmentItem<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  align?: "left" | "right"
  className?: string
}) {
  const pick = (next: string) => {
    const match = items.find((item) => item.value === next)
    if (match) onChange(match.value)
  }
  return (
    <div className={`period-toggle ${className}`.trim()}>
      <div className="period-toggle-pills">
        <JellyRadio items={items} value={value} onChange={pick} {...jellyTone} {...jellyMotion} ariaLabel={label} />
      </div>
      <div className="period-toggle-select">
        <GlideSelect
          options={items.map((item) => ({ value: item.value, label: item.label }))}
          value={value}
          onChange={pick}
          showTags={false}
          size="sm"
          ariaLabel={label}
          align={align}
        />
      </div>
    </div>
  )
}
