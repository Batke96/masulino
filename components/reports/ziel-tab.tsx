"use client"

import { KpiSlots } from "@/components/reports/kpi-slots"
import { ReportLead } from "@/components/reports/report-lead"
import { PeriodCompare } from "@/components/reports/period-compare"
import { monthTitle } from "@/lib/reports/dates"
import { targetView } from "@/lib/reports/facts"
import { euro, percent } from "@/lib/reports/format"
import { factsInCatalog, type SlotChoice } from "@/lib/reports/measures"
import type { PosReport } from "@/lib/workspace/client"

export function ZielTab({
  report,
  state,
  previous,
  previousState,
  choices,
  onChoice,
}: {
  report: PosReport | null
  state: "loading" | "ready" | "empty" | "failed"
  previous: PosReport | null
  previousState: "loading" | "ready" | "missing" | "failed"
  choices: SlotChoice[]
  onChoice: (index: number, choice: SlotChoice) => void
}) {
  if (state === "failed") {
    return <section className="surface"><p role="alert">Das Ziel ist gerade nicht erreichbar.</p></section>
  }
  if (state === "loading" || !report) {
    return <section className="surface"><p aria-live="polite">Das Ziel wird geladen.</p></section>
  }
  if (report.empty || state === "empty") {
    return <section className="surface"><p>Für diesen Standort liegen noch keine Kassenpositionen vor.</p></section>
  }

  const view = targetView(report)
  const facts = factsInCatalog("ziel", view.facts)
  const previousView = previous ? targetView(previous) : null
  const attainment = (gross: number, target: number) => (target > 0 ? percent(gross / target) : "—")

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <ReportLead note={`Das Tagesziel ist der mittlere Umsatz desselben Wochentags${report.targetLabel ? ` aus ${report.targetLabel}` : ""}. Gezählt sind die Tage mit einem Ziel bis zum letzten erfassten Tag.`} />
        <KpiSlots facts={facts} choices={choices} onChange={onChoice} />
        {view.splits.length > 0 ? (
          <section className="surface">
            <div className="section-head"><h2>Wochentage und Wochenende</h2></div>
            <div className="grid gap-4 sm:grid-cols-2">
              {view.splits.map((split) => (
                <div key={split.label}>
                  <p className="text-sm text-muted-foreground">{split.label}</p>
                  <strong className="mt-1 block text-xl tabular-nums">{euro(split.gross)}</strong>
                  <p className="fine-print">Ziel {euro(split.target)} · Abweichung {split.variance === null ? "—" : euro(split.variance)}</p>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <p>Für diesen Monat liegt kein Tagesziel vor.</p>
        )}
      </section>
      <PeriodCompare
        title="Vergleich"
        note="Zielerreichung des gewählten Monats und des Vormonats."
        items={[
          { label: monthTitle(report.month ?? ""), value: attainment(sumGross(view), sumTarget(view)) },
          {
            label: previousState === "ready" && previous?.month ? monthTitle(previous.month) : "Vormonat",
            value: previousState === "loading"
              ? "…"
              : previousView && sumTarget(previousView) > 0
                ? attainment(sumGross(previousView), sumTarget(previousView))
                : "—",
          },
          { label: "Abweichung", value: varianceLabel(view.facts.find((fact) => fact.id === "variance")?.value) },
        ]}
      />
    </div>
  )
}

function sumGross(view: ReturnType<typeof targetView>): number {
  return view.splits.reduce((sum, split) => sum + split.gross, 0)
}

function sumTarget(view: ReturnType<typeof targetView>): number {
  return view.splits.reduce((sum, split) => sum + split.target, 0)
}

function varianceLabel(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : euro(value)
}
