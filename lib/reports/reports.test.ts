import { describe, expect, it } from "vitest"
import { bookingWindow, type SpanBooking } from "./booking-window"
import { evaluateSlot, type Fact } from "./measures"

function booking(overrides: Partial<SpanBooking> & Pick<SpanBooking, "id" | "localDate">): SpanBooking {
  return {
    localTime: "14:30",
    status: "confirmed",
    organizerName: "Feier",
    packageName: "Geburtstag Deluxe",
    party: true,
    childrenCount: 8,
    adultCount: 4,
    tables: ["Tisch 1"],
    bookedValueMinor: 1000,
    currency: "EUR",
    ...overrides,
  }
}

describe("booking window", () => {
  const today = "2026-11-16"
  const rows = [
    booking({ id: "today", localDate: today, childrenCount: 3, adultCount: 0, bookedValueMinor: 1500 }),
    booking({ id: "last-week", localDate: "2026-11-10", party: false, packageName: "Gruppe", tables: ["Tisch 2"] }),
    booking({ id: "previous-week", localDate: "2026-11-09", status: "requested", bookedValueMinor: 9000 }),
    booking({ id: "ahead", localDate: "2026-11-20", bookedValueMinor: 2500 }),
    booking({ id: "no-show", localDate: today, status: "no_show", tables: ["Tisch 3"], bookedValueMinor: 4000 }),
  ]

  const window = bookingWindow(rows, today)

  it("counts the last seven visit days against the week before", () => {
    expect(window.bookings7).toBe(2)
    expect(window.bookingsPrevious7).toBe(1)
    expect(window.bookings7Delta).toBe(1)
  })

  it("keeps no-shows out of the table and out of the promised amount", () => {
    expect(window.occupancyToday).toBeGreaterThan(0)
    expect(window.occupancyToday).toBeLessThan(1)
    expect(window.partyValueToday).toBe(15)
    expect(window.partiesToday).toHaveLength(1)
  })

  it("sums only confirmed and completed value over the next 30 days", () => {
    expect(window.bookedValue30).toBe(40)
    expect(window.bookings30).toBe(2)
    expect(window.children30).toBe(11)
  })
})

describe("slot evaluation", () => {
  const facts: Fact[] = [
    { id: "gross", label: "Umsatz", per: "Euro", value: 100, unit: "euro" },
    { id: "children", label: "Zahlende Kinder", per: "Kind", value: 4, unit: "count" },
    { id: "target", label: "Tagesziel", per: "Ziel", value: 80, unit: "euro" },
    { id: "empty", label: "Leer", per: "Stück", value: 0, unit: "count" },
  ]

  it("formats a single measure and a ratio", () => {
    expect(evaluateSlot(facts, { numerator: "gross", denominator: null }).display).toBe(
      (100).toLocaleString("de-DE", { style: "currency", currency: "EUR" }),
    )
    expect(evaluateSlot(facts, { numerator: "gross", denominator: "children" })).toEqual({
      label: "Umsatz pro Kind",
      display: (25).toLocaleString("de-DE", { style: "currency", currency: "EUR" }),
    })
    expect(evaluateSlot(facts, { numerator: "gross", denominator: "target" }).display).toBe(
      (1.25).toLocaleString("de-DE", { style: "percent", maximumFractionDigits: 1 }),
    )
  })

  it("does not divide by zero", () => {
    expect(evaluateSlot(facts, { numerator: "gross", denominator: "empty" }).display).toBe("—")
  })
})
