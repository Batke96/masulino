"use client"

import { useState } from "react"
import { HeatmapChart } from "@/components/ui/heatmap-chart"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { datesFrom, longDate, monthBounds } from "@/lib/reports/dates"
import { count, percent } from "@/lib/reports/format"
import { occupancyMatrix, type SpanBooking } from "@/lib/reports/booking-window"
import { bandFor, occupancyBands } from "@/lib/reports/occupancy"

type Horizon = "7" | "14" | "month"
type Depth = "day" | "tables"

const segmented = "bg-background *:data-[slot=toggle-group-item]:bg-background *:data-[slot=toggle-group-item]:px-3"

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
    <section className="surface table-heatmap">
      <div className="section-head flex-wrap">
        <h2>Tischauslastung</h2>
        <Tabs value={horizon} onValueChange={(next) => { if (next === "7" || next === "14" || next === "month") setHorizon(next) }}>
          <TabsList aria-label="Zeitraum der Auslastung">
            <TabsTrigger value="7">7 Tage</TabsTrigger>
            <TabsTrigger value="14">14 Tage</TabsTrigger>
            <TabsTrigger value="month">Monat</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="heatmap-toolbar">
        <p className="fine-print">Personen geteilt durch die Plätze. Eine Kampagne wird daraus nicht gestartet.</p>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={depth}
          aria-label="Informationstiefe"
          className={segmented}
          onValueChange={(next) => { if (next === "day" || next === "tables") setDepth(next) }}
        >
          <ToggleGroupItem value="day">Tag</ToggleGroupItem>
          <ToggleGroupItem value="tables">Tische</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <HeatmapChart
        rows={chartRows}
        columns={heatmap.columns}
        showLegend={false}
        showRowLabels={depth === "tables"}
        columnLabelEvery={dates.length > 16 ? 2 : 1}
        columnNotes={heatmap.house.values.map((value) => percent(value))}
        fillForValue={(value) => bandFor(value).bg}
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
      <ul className="mt-3 flex list-none flex-wrap gap-3 p-0 text-sm">
        {occupancyBands.map((band) => (
          <li key={band.id} className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ background: band.bg, boxShadow: `inset 0 0 0 1px ${band.fg}` }} />
            {band.label}
          </li>
        ))}
      </ul>
      {activeDate ? (
        <div className="mt-4">
          <p>{longDate(activeDate)}{depth === "tables" ? ` · ${detail.label}` : ""}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-md bg-muted" role="img" aria-label={`${percent(ratio)} gebucht`}>
            <div className="h-2 rounded-md bg-primary" style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
          </div>
          <p className="fine-print mt-2">{percent(ratio)} gebucht · {count(people)} Personen auf {count(detail.seats)} Plätzen</p>
        </div>
      ) : null}
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
