"use client"

import { useEffect, useState } from "react"
import { Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, XAxis, YAxis } from "recharts"
import { BarList } from "@/components/reports/bar-list"
import { KpiSlots } from "@/components/reports/kpi-slots"
import { ReportLead } from "@/components/reports/report-lead"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { JellyButton } from "@/components/ui/jelly-button"
import { JellyRadio } from "@/components/ui/jelly-radio"
import { isWeekend, monthTitle } from "@/lib/reports/dates"
import { kasseFacts } from "@/lib/reports/facts"
import { count, euro, percent } from "@/lib/reports/format"
import { factsInCatalog, type SlotChoice } from "@/lib/reports/measures"
import type { PosReport } from "@/lib/workspace/client"

const shortMonths = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]

const groupColor: Record<string, string> = {
  eintritt: "var(--primary)",
  gastro: "var(--navy)",
  geburtstag: "#c9862a",
  chips: "#7a7e8b",
  sonstiges: "#b9bcc6",
}

function shortMonth(month: string): string {
  return shortMonths[Number(month.slice(5, 7)) - 1] ?? month
}

export function KasseTab({
  report,
  state,
  previous,
  previousState,
  localDate,
  view,
  choices,
  onChoice,
}: {
  report: PosReport | null
  state: "loading" | "ready" | "empty" | "failed"
  previous: PosReport | null
  previousState: "loading" | "ready" | "missing" | "failed"
  localDate: string | null
  view: "month" | "year"
  choices: SlotChoice[]
  onChoice: (index: number, choice: SlotChoice) => void
}) {
  const [measure, setMeasure] = useState<"gross" | "quantity">("gross")
  const [group, setGroup] = useState<string | null>(null)
  const [category, setCategory] = useState<string | null>(null)

  useEffect(() => {
    setGroup(null)
    setCategory(null)
  }, [report?.month, report?.year, view])

  if (state === "failed") {
    return <section className="surface"><p role="alert">Die Kassenauswertung ist gerade nicht erreichbar. Es wurde nichts neu berechnet.</p></section>
  }
  if (state === "loading" || !report) {
    return <section className="surface"><p aria-live="polite">Die Kassenauswertung wird geladen.</p></section>
  }
  if (report.empty || state === "empty") {
    return <section className="surface"><p>Für diesen Standort liegen noch keine Kassenpositionen vor.</p></section>
  }

  const facts = factsInCatalog("kasse", kasseFacts(report, localDate))
  const activeGroup = group ? report.mix.find((item) => item.key === group) ?? null : null
  const throughMonth = report.throughDate?.slice(0, 7)
  const visibleCategories = report.categories.filter((item) => !group || item.groupKey === group)
  const categoryGross = visibleCategories.reduce((sum, item) => sum + item.gross, 0)
  const visibleProducts = report.products.filter((item) => (
    category ? item.category === category : !group || visibleCategories.some((entry) => entry.category === item.category)
  ))
  const productGross = visibleProducts.reduce((sum, item) => sum + item.gross, 0)
  const mixTotal = report.mix.reduce((sum, item) => sum + item.gross, 0)
  const trendConfig = {
    current: { label: String(report.year), color: "var(--primary)" },
    currentPartial: { label: report.year ? `${report.year}, unvollständig` : "Unvollständig", color: "var(--primary)" },
    previous: { label: String((report.year ?? 0) - 1), color: "var(--navy)" },
  } satisfies ChartConfig
  const partialMonth = report.incomplete ? throughMonth : undefined
  const trendRows = report.trend.map((item, index, all) => {
    const value = measure === "gross" ? item.gross : item.quantity
    const previousValue = measure === "gross" ? item.previousGross : item.previousQuantity
    const afterPartial = Boolean(partialMonth && item.month > partialMonth)
    const isPartial = item.month === partialMonth
    const anchorsPartial = Boolean(partialMonth && (isPartial || all[index + 1]?.month === partialMonth))
    return {
      label: shortMonth(item.month),
      current: afterPartial || isPartial ? null : value,
      currentOpen: anchorsPartial ? value : null,
      currentPartial: isPartial ? value : null,
      previous: previousValue,
    }
  })
  const firstCompare = report.trend.find((item) => (measure === "gross" ? item.previousGross : item.previousQuantity) != null)
  const compareFrom = firstCompare && !firstCompare.month.endsWith("-01")
    ? ` Vergleich ab ${shortMonths[Number(firstCompare.month.slice(5, 7)) - 1]} ${report.year ? report.year - 1 : ""}.`
    : ""
  const partialNote = report.incomplete && report.throughDate
    ? ` Bis ${new Date(`${report.throughDate}T00:00:00Z`).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} gestrichelt.`
    : ""
  const dayConfig = {
    gross: { label: "Umsatz", color: "var(--primary)" },
    quantity: { label: "Stück", color: "var(--navy)" },
    target: { label: report.targetLabel ? `Ziel ${report.targetLabel}` : "Ziel", color: "#7a7e8b" },
  } satisfies ChartConfig
  const dayRows = report.days.map((day) => ({
    date: day.date,
    label: day.date.slice(8),
    gross: day.gross,
    quantity: day.quantity,
    target: day.targetGross,
    partial: day.partial,
    weekend: isWeekend(day.date),
  }))
  const weekendLabels = new Set(dayRows.filter((day) => day.weekend).map((day) => day.label))

  return (
    <div className="report-groups">
      <section className="report-block">
        <ReportLead
          alert={report.incomplete && report.throughDate ? (
            <div className="callout blue"><div><strong>Unvollständiger Zeitraum</strong><p>Die Daten reichen bis zum {new Date(`${report.throughDate}T00:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC" })}.</p></div></div>
          ) : null}
          note="Wirtschaftlicher Ist-Wert aus der Kasse. Buchungen sind hier nicht enthalten."
        />
        <KpiSlots facts={facts} choices={choices} onChange={onChoice} />

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="surface">
            <div className="section-head flex-wrap">
              <h2>Verteilung</h2>
              <p className="fine-print" aria-live="polite">{activeGroup ? `${activeGroup.label} filtert die Kategorien` : "Ein Segment filtert die Kategorien"}</p>
            </div>
            <div className="relative">
              <ChartContainer config={{}} className="mx-auto aspect-square max-h-72">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Pie
                    data={report.mix}
                    dataKey="gross"
                    nameKey="label"
                    innerRadius={68}
                    outerRadius={96}
                    paddingAngle={2}
                    className="cursor-pointer"
                    onClick={(_, index) => {
                      const next = report.mix[index]?.key ?? null
                      setGroup((current) => current === next ? null : next)
                      setCategory(null)
                    }}
                  >
                    {report.mix.map((item) => (
                      <Cell key={item.key} fill={groupColor[item.key] ?? "#b9bcc6"} fillOpacity={!group || group === item.key ? 1 : 0.18} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <strong className="text-lg tabular-nums">{euro(activeGroup ? activeGroup.gross : report.cards.gross.value)}</strong>
                <span className="text-xs text-muted-foreground">{activeGroup ? activeGroup.label : "Umsatz"}</span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-2 text-sm">
              {report.mix.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`inline-flex min-h-8 items-center gap-2 rounded-md px-2 ${group === item.key ? "bg-muted font-medium" : ""}`}
                  aria-pressed={group === item.key}
                  aria-controls="kategorien-liste"
                  onClick={() => { setGroup((current) => current === item.key ? null : item.key); setCategory(null) }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full" style={{ background: groupColor[item.key] ?? "#b9bcc6" }} />
                    <strong className="tabular-nums font-semibold">{percent(mixTotal > 0 ? item.gross / mixTotal : 0)}</strong>
                  </span>
                  {item.label}
                  <span className="tabular-nums text-muted-foreground">{euro(item.gross)}</span>
                </button>
              ))}
            </div>
            <p className="fine-print mt-3">
              {report.gastroPerChild !== null ? `Gastro je Kind ${euro(report.gastroPerChild)}. ` : ""}
              {report.chipsPerChild !== null ? `Chips je Kind ${count(report.chipsPerChild)}.` : ""}
            </p>
          </section>
          <section className="surface" id="kategorien-liste">
            <div className="section-head flex-wrap">
              <h2 id="kategorien-titel">{category ?? "Kategorien"}</h2>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <p className="fine-print" aria-live="polite">{activeGroup ? `Nur ${activeGroup.label} · ` : ""}Nach Umsatz</p>
                {category ? <JellyButton variant="soft" onClick={() => setCategory(null)}>Alle Kategorien</JellyButton> : null}
                {activeGroup ? <JellyButton variant="soft" onClick={() => { setGroup(null); setCategory(null) }}>Alle Gruppen</JellyButton> : null}
              </div>
            </div>
            <BarList
              label={category ? "Produkte" : "Kategorien"}
              selected={category}
              onSelect={category ? undefined : (id) => setCategory(id)}
              items={(category ? visibleProducts : visibleCategories).map((item) => {
                const isProduct = "name" in item
                const gross = item.gross
                const shareBase = category ? productGross : categoryGross
                return {
                  id: isProduct ? item.name : item.category,
                  label: isProduct ? item.name : item.category,
                  share: shareBase > 0 ? gross / shareBase : 0,
                  valueLabel: euro(gross),
                  note: isProduct
                    ? `${count(item.quantity)} Stück`
                    : `${count(item.quantity)} Stück${item.parties > 0 ? ` · ${item.parties} Feiern` : ""}`,
                }
              })}
            />
          </section>
        </div>

        {view === "month" ? (
          <section className="surface">
            <div className="section-head flex-wrap">
              <h2>Monatsübersicht</h2>
              {report.targetLabel ? <p className="fine-print">Tagesziel aus {report.targetLabel}</p> : null}
            </div>
            <p className="fine-print mb-3">
              Balken in Euro, Linie in Stück. Samstag und Sonntag sind gedämpft, die übrigen Tage im Akzent.
              {report.days.some((day) => day.partial) ? " Der blasse Balken ist der letzte erfasste Tag." : ""}
            </p>
            <ChartContainer config={dayConfig} className="aspect-auto h-80 w-full max-w-none">
              <ComposedChart data={dayRows}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={(props) => {
                    const label = String(props.payload?.value ?? "")
                    const weekend = weekendLabels.has(label)
                    return (
                      <text x={props.x} y={props.y} dy={14} textAnchor="middle" fill={weekend ? "var(--muted-foreground)" : "var(--text)"} fontSize={12} fontWeight={weekend ? 650 : 400}>
                        {label}
                      </text>
                    )
                  }}
                />
                <YAxis yAxisId="euro" tickLine={false} axisLine={false} width={72} tickFormatter={(value: number) => value.toLocaleString("de-DE", { maximumFractionDigits: 0 })} />
                <YAxis yAxisId="piece" orientation="right" tickLine={false} axisLine={false} width={48} tickFormatter={(value: number) => count(value)} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar yAxisId="euro" dataKey="gross" fill="var(--color-gross)" radius={3}>
                  {dayRows.map((day) => (
                    <Cell
                      key={day.date}
                      fill={day.weekend ? "var(--muted-foreground)" : "var(--color-gross)"}
                      fillOpacity={day.partial ? 0.4 : day.weekend ? 0.45 : 1}
                    />
                  ))}
                </Bar>
                <Line yAxisId="piece" dataKey="quantity" stroke="var(--color-quantity)" strokeWidth={2} dot={false} />
                <Line yAxisId="euro" dataKey="target" stroke="var(--color-target)" strokeDasharray="4 4" dot={false} />
                <ChartLegend content={<ChartLegendContent />} />
              </ComposedChart>
            </ChartContainer>
          </section>
        ) : null}
      </section>

      <section className="report-block">
        <div className="section-head"><h2>Vergleich</h2></div>
        {view === "month" ? (
          <section className="surface">
            <div className="section-head"><h2>Vormonat</h2></div>
            {previousState === "loading" ? <p aria-live="polite">Der Vormonat wird geladen.</p> : null}
            {previousState === "failed" ? <p role="alert">Der Vormonat ist gerade nicht erreichbar.</p> : null}
            {previousState === "missing" ? <p>Für den Vormonat liegen keine Kassenpositionen vor.</p> : null}
            {previousState === "ready" && previous ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">{monthTitle(report.month ?? "")}</p>
                  <strong className="mt-1 block text-xl tabular-nums">{euro(report.cards.gross.value)}</strong>
                  <p className="fine-print">{count(report.cards.payingChildren.value)} zahlende Kinder</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{monthTitle(previous.month ?? "")}</p>
                  <strong className="mt-1 block text-xl tabular-nums">{euro(previous.cards.gross.value)}</strong>
                  <p className="fine-print">{count(previous.cards.payingChildren.value)} zahlende Kinder</p>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
        <section className="surface">
          <div className="section-head flex-wrap">
            <h2>Verlauf</h2>
            <JellyRadio
              items={[
                { value: "gross", label: "Umsatz" },
                { value: "quantity", label: "Stück" },
              ]}
              value={measure}
              onChange={(next) => {
                if (next === "gross" || next === "quantity") setMeasure(next)
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
              ariaLabel="Kennzahl im Verlauf"
            />
          </div>
          <p className="fine-print mb-3">
            {measure === "gross" ? "Umsatz in Euro." : "Stück."} Gesamter Standort, ohne Filter aus der Verteilung. {report.year} gegen {report.year ? report.year - 1 : "das Vorjahr"}.{compareFrom}{partialNote}
          </p>
          <ChartContainer config={trendConfig} className="aspect-auto h-80 w-full max-w-none">
            <ComposedChart data={trendRows}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={(value: number) => value.toLocaleString("de-DE", { maximumFractionDigits: 0 })} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line dataKey="previous" stroke="var(--color-previous)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              <Line dataKey="current" stroke="var(--color-current)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="currentOpen" stroke="var(--color-current)" strokeWidth={2} strokeDasharray="4 4" dot={false} legendType="none" tooltipType="none" isAnimationActive={false} />
              <Line dataKey="currentPartial" stroke="none" strokeWidth={0} dot={{ r: 3, fill: "var(--color-current)" }} legendType="none" isAnimationActive={false} />
              <ChartLegend content={<ChartLegendContent />} />
            </ComposedChart>
          </ChartContainer>
        </section>
      </section>
    </div>
  )
}
