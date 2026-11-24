"use client"

import { GlideSelect } from "@/components/ui/glide-select"

export const bookingKinds = [
  { id: "all", label: "Alle" },
  { id: "geburtstag", label: "Geburtstage" },
  { id: "kita", label: "Kita" },
] as const

export type BookingKind = (typeof bookingKinds)[number]["id"]

const kindItems = bookingKinds.map((item) => ({
  value: item.id,
  label: item.label,
}))

function isBookingKind(value: string): value is BookingKind {
  return bookingKinds.some((item) => item.id === value)
}

export function BookingKindFilter({
  value,
  onChange,
}: {
  value: BookingKind
  onChange: (kind: BookingKind) => void
}) {
  return (
    <GlideSelect
      options={kindItems}
      value={value}
      onChange={(next) => {
        if (isBookingKind(next)) onChange(next)
      }}
      showTags={false}
      size="md"
      variant="button"
      ariaLabel="Art"
    />
  )
}
