import type { PosReport } from "../workspace/client"
import type { BookingWindow } from "./booking-window"
import { change, isWeekend } from "./dates"
import type { Fact } from "./measures"

const shareLabel: Record<string, string> = {
  eintritt: "Anteil Eintritt",
  gastro: "Anteil Gastro",
  geburtstag: "Anteil Geburtstag",
  chips: "Anteil Chips",
  sonstiges: "Anteil Sonstige",
}

export function kasseFacts(report: PosReport, localDate: string | null): Fact[] {
  const gross = report.cards.gross.value
  const children = report.cards.payingChildren.value
  const gastro = report.gastroPerChild !== null && children > 0 ? report.gastroPerChild * children : null
  const today = localDate ? report.days.find((day) => day.date === localDate) : undefined
  const todayValue = today && !today.future ? today.gross : null
  const todayDelta = today && todayValue !== null && today.targetGross ? change(todayValue, today.targetGross) : null
  const todayNote = !today
    ? "Nicht im gewählten Monat."
    : today.future || todayValue === null
      ? "Noch nicht erfasst."
      : today.targetGross
        ? "Mittel dieses Wochentags"
        : undefined
  const shares = ["eintritt", "gastro", "geburtstag", "chips", "sonstiges"].map((key) => {
    const item = report.mix.find((entry) => entry.key === key)
    return fact(`share:${key}`, shareLabel[key] ?? key, "Anteil", gross > 0 && item ? item.gross / gross : item ? 0 : null, "ratio")
  })
  return [
    fact("gross", "Umsatz", "Euro", gross, "euro", report.cards.gross.delta, report.comparisonLabel, report.cards.gross.trend),
    fact("payingChildren", "Zahlende Kinder", "Kind", children, "count", report.cards.payingChildren.delta, report.comparisonLabel, report.cards.payingChildren.trend),
    fact("gastroGross", "Gastro", "Euro", gastro, "euro"),
    fact("receipts", "Belege", "Beleg", report.cards.receipts.value, "count", report.cards.receipts.delta, report.comparisonLabel, report.cards.receipts.trend),
    fact(
      "todayGross",
      "Umsatz heute",
      "Euro",
      today ? todayValue : null,
      "euro",
      todayDelta,
      todayNote,
    ),
    ...shares,
  ]
}

export function bookingFacts(window: BookingWindow): Fact[] {
  return [
    fact("occupancyToday", "Tischauslastung heute", "Tag", window.occupancyToday, "ratio"),
    fact("occupancy7", "Tischauslastung, 7 Tage", "Tag", window.occupancy7, "ratio"),
    fact("bookings7", "Buchungen, 7 Tage", "Buchung", window.bookings7, "count", window.bookings7Delta, "gegen die Vorwoche"),
    fact("bookedValue30", "Gebuchter Wert, 30 Tage", "Euro", window.bookedValue30, "euro", null, "Zugesagter Paketbetrag. Keine eingegangene Zahlung."),
    fact("bookings30", "Buchungen, 30 Tage", "Buchung", window.bookings30, "count"),
    fact("children30", "Kinder, 30 Tage", "Kind", window.children30, "count"),
  ]
}

export function birthdayFacts(window: BookingWindow): Fact[] {
  return [
    fact("partiesToday", "Feiern heute", "Feier", window.partiesToday.length, "count"),
    fact("childrenToday", "Kinder heute", "Kind", window.childrenToday, "count"),
    fact("adultsToday", "Erwachsene heute", "Erwachsener", window.adultsToday, "count"),
    fact("partyValueToday", "Gebuchter Wert heute", "Euro", window.partyValueToday, "euro", null, "Zugesagter Paketbetrag der heutigen Feiern."),
  ]
}

export function visitorFacts(report: PosReport, window: BookingWindow): Fact[] {
  return [
    fact("payingChildren", "Zahlende Kinder", "Kind", report.cards.payingChildren.value, "count", report.cards.payingChildren.delta, report.comparisonLabel),
    fact("bookedPeople", "Gebuchte Personen", "Person", window.monthPeople, "count", change(window.monthPeople, window.previousMonthPeople), "gegen den Vormonat"),
    fact("gross", "Umsatz", "Euro", report.cards.gross.value, "euro"),
    fact("monthChildren", "Kinder im Monat", "Kind", window.monthChildren, "count"),
    fact("monthBookings", "Buchungen im Monat", "Buchung", window.monthBookings, "count"),
  ]
}

export type TargetSplit = {
  label: string
  gross: number
  target: number
  variance: number | null
}

export function targetView(report: PosReport): { facts: Fact[]; splits: TargetSplit[] } {
  const elapsed = report.days.filter((day) => !day.future && day.gross !== null && day.targetGross !== null)
  const gross = elapsed.reduce((sum, day) => sum + (day.gross ?? 0), 0)
  const target = elapsed.reduce((sum, day) => sum + (day.targetGross ?? 0), 0)
  const hasTarget = elapsed.length > 0 && report.targetLabel !== null
  const variance = hasTarget ? gross - target : null
  const splitOf = (label: string, weekend: boolean): TargetSplit => {
    const days = elapsed.filter((day) => isWeekend(day.date) === weekend)
    const dayGross = days.reduce((sum, day) => sum + (day.gross ?? 0), 0)
    const dayTarget = days.reduce((sum, day) => sum + (day.targetGross ?? 0), 0)
    return { label, gross: dayGross, target: dayTarget, variance: days.length > 0 ? dayGross - dayTarget : null }
  }
  return {
    facts: [
      fact("gross", "Umsatz", "Euro", hasTarget ? gross : report.cards.gross.value, "euro"),
      fact("target", "Tagesziel", "Ziel", hasTarget ? target : null, "euro", null, report.targetLabel ? `aus ${report.targetLabel}` : "Kein Tagesziel"),
      fact("variance", "Abweichung", "Euro", variance, "euro"),
    ],
    splits: hasTarget ? [splitOf("Wochentage", false), splitOf("Wochenende", true)] : [],
  }
}

function fact(
  id: string,
  label: string,
  per: string,
  value: number | null,
  unit: Fact["unit"],
  delta?: number | null,
  deltaLabel?: string,
  trend?: number[],
): Fact {
  return { id, label, per, value, unit, delta, deltaLabel, trend }
}
