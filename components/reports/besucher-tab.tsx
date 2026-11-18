"use client"

import { KpiSlots } from "@/components/reports/kpi-slots"
import { PeriodCompare } from "@/components/reports/period-compare"
import { ReportLead } from "@/components/reports/report-lead"
import { bookingWindow, type SpanBooking } from "@/lib/reports/booking-window"
import { visitorFacts } from "@/lib/reports/facts"
import { count, euro, percent } from "@/lib/reports/format"
import { factsInCatalog, type SlotChoice } from "@/lib/reports/measures"
import type { PosReport } from "@/lib/workspace/client"

export function BesucherTab({
  report,
  reportState,
  rows,
  rowsState,
  localDate,
  clock,
  choices,
  onChoice,
}: {
  report: PosReport | null
  reportState: "loading" | "ready" | "empty" | "failed"
  rows: SpanBooking[] | null
  rowsState: "loading" | "ready" | "failed"
  localDate: string | null
  clock: "loading" | "ready" | "failed"
  choices: SlotChoice[]
  onChoice: (index: number, choice: SlotChoice) => void
}) {
  if (reportState === "failed" && rowsState === "failed") {
    return <section className="surface"><p role="alert">Die Besucherauswertung ist gerade nicht erreichbar.</p></section>
  }
  if (clock === "loading" || (reportState === "loading" && !report) || (rowsState === "loading" && !rows)) {
    return <section className="surface"><p aria-live="polite">Die Besucherauswertung wird geladen.</p></section>
  }
  if (clock === "failed" && !report) {
    return <section className="surface"><p role="alert">Der heutige Tag ist nicht bekannt. Die Besucher können nicht eingeordnet werden.</p></section>
  }

  const anchor = report?.month ? `${report.month}-01` : localDate
  const window = rows && anchor ? bookingWindow(rows, anchor) : null
  const facts = report && window && !report.empty
    ? factsInCatalog("besucher", visitorFacts(report, window))
    : []

  return (
    <div className="report-groups">
      <section className="report-block">
        <ReportLead
          alert={reportState === "failed" ? <p role="alert">Die Kasse ist gerade nicht erreichbar.</p> : report?.empty ? <p>Für diesen Standort liegen noch keine Kassenpositionen vor.</p> : null}
          note="Zahlende Kinder kommen aus der Kasse. Gebuchte Personen sind Kinder und Erwachsene in den Reservierungen. Die Paketdauer ist kein gemessener Aufenthalt."
        />
        {facts.length > 0 ? <KpiSlots facts={facts} choices={choices} onChange={onChoice} /> : null}
      </section>
      {window ? (
        <PeriodCompare
          title="Vergleich"
          note="Gebuchte Personen gegen Vormonat und Vorjahr. Die Kinder aus der Kasse vergleichen die Karten oben."
          items={[
            { label: "Dieser Monat", value: count(window.monthPeople) },
            { label: "Vormonat", value: count(window.previousMonthPeople) },
            { label: "Vorjahr", value: count(window.previousYearPeople) },
            { label: "Umsatz Kasse", value: report && !report.empty ? euro(report.cards.gross.value) : "—" },
            { label: "Zahlende Kinder", value: report && !report.empty ? count(report.cards.payingChildren.value) : "—" },
            { label: report?.comparisonLabel ?? "Vergleich", value: report?.cards.payingChildren.delta == null ? "—" : percent(report.cards.payingChildren.delta) },
          ]}
        />
      ) : null}
    </div>
  )
}
