"use client"

import { KpiSlots } from "@/components/reports/kpi-slots"
import { ReportLead } from "@/components/reports/report-lead"
import { PeriodCompare } from "@/components/reports/period-compare"
import { bookingWindow, type SpanBooking } from "@/lib/reports/booking-window"
import { longDate, monthTitle } from "@/lib/reports/dates"
import { birthdayFacts } from "@/lib/reports/facts"
import { count } from "@/lib/reports/format"
import { factsInCatalog, type SlotChoice } from "@/lib/reports/measures"

export function GeburtstageTab({
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
    return <section className="surface"><p role="alert">Der heutige Tag ist nicht bekannt. Die Feiern können nicht eingeordnet werden.</p></section>
  }
  if (clock === "loading" || !localDate) {
    return <section className="surface"><p aria-live="polite">Der heutige Tag wird geladen.</p></section>
  }
  if (state === "failed") {
    return <section className="surface"><p role="alert">Die Feiern sind gerade nicht erreichbar.</p></section>
  }
  if (state === "loading" || !rows) {
    return <section className="surface"><p aria-live="polite">Die Feiern werden geladen.</p></section>
  }

  const window = bookingWindow(rows, localDate)
  const facts = factsInCatalog("geburtstage", birthdayFacts(window))
  const month = localDate.slice(0, 7)

  return (
    <div className="report-groups">
      <section className="report-block">
        <ReportLead note={`Heute im Haus, ${longDate(localDate)}. Gezählt werden Reservierungen, deren Paket ein Geburtstag ist.`} />
        <KpiSlots facts={facts} choices={choices} onChange={onChoice} />
        <section className="surface">
          <div className="section-head"><h2>Heute</h2></div>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Geburtstage</p>
              <strong className="mt-1 block text-xl tabular-nums">{count(window.partiesToday.length)}</strong>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Kinder</p>
              <strong className="mt-1 block text-xl tabular-nums">{count(window.childrenToday)}</strong>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Erwachsene</p>
              <strong className="mt-1 block text-xl tabular-nums">{count(window.adultsToday)}</strong>
            </div>
          </div>
          {window.partiesToday.length === 0 ? (
            <p>Heute steht keine Feier in den Reservierungen.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Beginn</th>
                  <th className="py-2 pr-3 font-medium">Feier</th>
                  <th className="py-2 pr-3 font-medium">Gäste</th>
                  <th className="py-2 font-medium">Paket</th>
                </tr>
              </thead>
              <tbody>
                {window.partiesToday.map((party) => (
                  <tr key={party.id} className="border-b border-border">
                    <td className="py-2 pr-3 tabular-nums">{party.localTime}</td>
                    <td className="py-2 pr-3">{party.organizerName}{party.tables.length > 0 ? ` · ${party.tables.join(", ")}` : ""}</td>
                    <td className="py-2 pr-3 tabular-nums">{party.childrenCount} K · {party.adultCount} E</td>
                    <td className="py-2">{party.packageName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </section>
      <PeriodCompare
        title="Vergleich"
        note="Feiern in den Reservierungen, nicht die Kassenbelege."
        items={[
          { label: monthTitle(month), value: count(window.partiesMonth) },
          { label: "Vormonat", value: count(window.partiesPreviousMonth) },
          { label: "Vorjahr", value: count(window.partiesPreviousYear) },
        ]}
      />
    </div>
  )
}
