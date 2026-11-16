"use client"

import { OccupancyPanel } from "@/components/booking/occupancy-panel"
import { KpiSlots } from "@/components/reports/kpi-slots"
import { ReportLead } from "@/components/reports/report-lead"
import { PeriodCompare } from "@/components/reports/period-compare"
import { bookingWindow, type SpanBooking } from "@/lib/reports/booking-window"
import { bookingFacts } from "@/lib/reports/facts"
import { count, euro } from "@/lib/reports/format"
import { factsInCatalog, type SlotChoice } from "@/lib/reports/measures"

export function BuchungenTab({
  rows,
  state,
  localDate,
  clock,
  choices,
  onChoice,
}: {
  rows: SpanBooking[] | null
  state: "loading" | "ready" | "failed"
  localDate: string | null
  clock: "loading" | "ready" | "failed"
  choices: SlotChoice[]
  onChoice: (index: number, choice: SlotChoice) => void
}) {
  if (clock === "failed") {
    return <section className="surface"><p role="alert">Der heutige Tag ist nicht bekannt. Die Buchungen können nicht eingeordnet werden.</p></section>
  }
  if (clock === "loading" || !localDate) {
    return <section className="surface"><p aria-live="polite">Der heutige Tag wird geladen.</p></section>
  }
  if (state === "failed") {
    return <section className="surface"><p role="alert">Die Buchungen sind gerade nicht erreichbar. Es wurde nichts neu berechnet.</p></section>
  }
  if (state === "loading" || !rows) {
    return <section className="surface"><p aria-live="polite">Die Buchungen werden geladen.</p></section>
  }

  const window = bookingWindow(rows, localDate)
  const facts = factsInCatalog("buchungen", bookingFacts(window))

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <ReportLead />
        <KpiSlots facts={facts} choices={choices} onChange={onChoice} />
        <OccupancyPanel rows={rows} anchorDate={localDate} />
      </section>
      <PeriodCompare
        title="Vergleich"
        note="Gebuchter Wert ist der zugesagte Paketbetrag bestätigter und abgeschlossener Reservierungen. Keine eingegangene Zahlung."
        items={[
          { label: "Buchungen, 7 Tage", value: count(window.bookings7) },
          { label: "Buchungen, Vorwoche", value: count(window.bookingsPrevious7) },
          { label: "Buchungen, dieser Monat", value: count(window.monthBookingCount) },
          { label: "Gebuchter Wert, dieser Monat", value: money(window.monthBookedValue) },
          { label: "Gebuchter Wert, Vormonat", value: money(window.previousMonthBookedValue) },
          { label: "Gebuchter Wert, Vorjahr", value: money(window.previousYearBookedValue) },
        ]}
      />
    </div>
  )
}

function money(value: number | null): string {
  return value === null ? "—" : euro(value)
}
