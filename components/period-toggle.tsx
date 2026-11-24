"use client"

import { GlideSelect } from "@/components/ui/glide-select"
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
  align = "left",
}: {
  value: BookingPeriod
  onChange: (period: BookingPeriod) => void
  label?: string
  align?: "left" | "right"
}) {
  return (
    <GlideSelect
      options={periodItems}
      value={value}
      onChange={(next) => {
        if (isBookingPeriod(next)) onChange(next)
      }}
      showTags={false}
      size="md"
      variant="button"
      align={align}
      ariaLabel={label}
    />
  )
}
