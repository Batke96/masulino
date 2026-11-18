"use client"

import { useState } from "react"
import { HeatmapChart } from "@/components/ui/heatmap-chart"
import { GlideSelect } from "@/components/ui/glide-select"
import { JellyRadio } from "@/components/ui/jelly-radio"
import { datesFrom, longDate, monthBounds } from "@/lib/reports/dates"
import { count, percent } from "@/lib/reports/format"
import { occupancyMatrix, type SpanBooking } from "@/lib/reports/booking-window"
import { occupancyBands, occupancyFill } from "@/lib/reports/occupancy"

type Horizon = "7" | "14" | "month"
type Depth = "day" | "tables"

export function OccupancyPanel({
  rows,
  anchorDate,
}: {
  rows: SpanBooking[]
  anchorDate: string
}) {
  const [horizon, setHorizon] = useState<Horizon>("7")
  const [depth, setDepth] = useState<Depth>("day")
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedRow, setSelectedRow] = useState(0)

  const dates = horizonDates(anchorDate, horizon)
  const heatmap = occupancyMatrix(rows, dates)
  const chartRows = depth === "day" ? [heatmap.house] : heatmap.rows
  const activeDate = selectedDate && dates.includes(selectedDate) ? selectedDate : dates.includes(anchorDate) ? anchorDate : dates[0]
  const column = activeDate ? dates.indexOf(activeDate) : 0
  const detail = depth === "tables" ? heatmap.rows[selectedRow] ?? heatmap.house : heatmap.house
  const ratio = detail.values[column] ?? 0
  const people = detail.people[column] ?? 0

  return (
    <section className="occupancy-block">
      <div className="section-head">
        <h2>Tischauslastung</h2>
        <div className="occupancy-controls">
          <div className="occupancy-tabs">
            <JellyRadio
              items={[
                { value: "7", label: "7 Tage" },
                { value: "14", label: "14 Tage" },
                { value: "month", label: "Monat" },
              ]}
              value={horizon}
              onChange={(next) => {
                if (next === "7" || next === "14" || next === "month") setHorizon(next)
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
              ariaLabel="Zeitraum der Auslastung"
            />
            <JellyRadio
              items={[
                { value: "day", label: "Tag" },
                { value: "tables", label: "Tische" },
              ]}
              value={depth}
              onChange={(next) => {
                if (next === "day" || next === "tables") setDepth(next)
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
              ariaLabel="Informationstiefe"
            />
          </div>
          <div className="occupancy-selects">
            <GlideSelect
              options={[
                { value: "7", label: "7 Tage" },
                { value: "14", label: "14 Tage" },
                { value: "month", label: "Monat" },
              ]}
              value={horizon}
              onChange={(next) => {
                if (next === "7" || next === "14" || next === "month") setHorizon(next)
              }}
              showTags={false}
              ariaLabel="Zeitraum der Auslastung"
              align="right"
            />
            <GlideSelect
              options={[
                { value: "day", label: "Tag" },
                { value: "tables", label: "Tische" },
              ]}
              value={depth}
              onChange={(next) => {
                if (next === "day" || next === "tables") setDepth(next)
              }}
              showTags={false}
              ariaLabel="Informationstiefe"
              align="right"
            />
          </div>
        </div>
      </div>
      <div className="surface table-heatmap">
        {activeDate ? (
          <div>
            <p>{longDate(activeDate)}{depth === "tables" ? ` · ${detail.label}` : ""}</p>
            <div className="mt-2 h-3 overflow-hidden rounded-md bg-muted" role="img" aria-label={`${percent(ratio)} gebucht`}>
              <div className="h-3 rounded-md bg-primary" style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
            </div>
            <p className="fine-print mt-2">{percent(ratio)} gebucht · {count(people)} Personen auf {count(detail.seats)} Plätzen</p>
          </div>
        ) : null}
        <ul className={`${activeDate ? "mt-3" : ""} flex list-none flex-wrap gap-3 p-0 text-xs`}>
          {occupancyBands.map((band) => (
            <li key={band.id} className="inline-flex items-center gap-2">
              <span className="size-2.5 rounded-sm" style={{ background: band.bg, boxShadow: `inset 0 0 0 1px ${band.fg}` }} />
              {band.label} {band.range}
            </li>
          ))}
        </ul>
        <HeatmapChart
          className="mt-3"
          rows={chartRows}
          columns={heatmap.columns}
          showLegend={false}
          showRowLabels={depth === "tables"}
          columnLabelEvery={dates.length > 16 ? 2 : 1}
          columnNotes={heatmap.house.values.map((value) => percent(value))}
          fillForValue={occupancyFill}
          selectedColumn={column}
          valueFormatter={(value) => percent(value)}
          onCellClick={(datum) => {
            const date = dates[datum.column]
            if (date) setSelectedDate(date)
            setSelectedRow(datum.row)
          }}
          renderTooltip={(datum) => {
            const source = chartRows[datum.row]
            const booked = source?.people[datum.column] ?? 0
            const seats = source?.seats ?? 0
            return (
              <>
                <span className="font-medium tabular-nums">{percent(datum.value)} · {count(booked)} von {count(seats)}</span>
                <span className="text-background/70 block">
                  {depth === "day" ? datum.columnLabel : `${datum.rowLabel} · ${datum.columnLabel}`}
                </span>
              </>
            )
          }}
        />
      </div>
    </section>
  )
}

function horizonDates(anchor: string, horizon: Horizon): string[] {
  if (horizon === "7") return datesFrom(anchor, 7)
  if (horizon === "14") return datesFrom(anchor, 14)
  const end = monthBounds(anchor.slice(0, 7)).to
  return datesFrom(anchor, Math.max(1, dayCount(anchor, end)))
}

function dayCount(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  return Math.round((end - start) / 86_400_000) + 1
}
