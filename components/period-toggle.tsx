"use client"

import { GlideSelect } from "@/components/ui/glide-select"
import { JellyRadio } from "@/components/ui/jelly-radio"
import { bookingPeriods, type BookingPeriod } from "@/lib/booking/period"

const periodItems = bookingPeriods.map((item) => ({
  value: item.id,
  label: item.label,
}))

function isBookingPeriod(value: string): value is BookingPeriod {
  return bookingPeriods.some((item) => item.id === value)
}

export function PeriodToggle({
  value,
  onChange,
  label = "Zeitraum",
}: {
  value: BookingPeriod
  onChange: (period: BookingPeriod) => void
  label?: string
}) {
  return (
    <div className="period-toggle">
      <div className="period-toggle-pills">
        <JellyRadio
          items={periodItems}
          value={value}
          onChange={(next) => {
            if (isBookingPeriod(next)) onChange(next)
          }}
          chipColor="var(--muted)"
          activeColor="var(--ink)"
          textColor="var(--text-secondary)"
          activeTextColor="var(--primary-foreground)"
          size="md"
          gap={8}
          radius={18}
          swell={0}
          barge={0}
          shrink={0}
          jelly={0.15}
          bounce={0.05}
          stagger={6}
          stiffness={780}
          ariaLabel={label}
        />
      </div>
      <div className="period-toggle-select">
        <GlideSelect
          options={periodItems}
          value={value}
          onChange={(next) => {
            if (isBookingPeriod(next)) onChange(next)
          }}
          showTags={false}
          size="sm"
          ariaLabel={label}
          align="right"
        />
      </div>
    </div>
  )
}
