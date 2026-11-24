"use client"

import { useState } from "react"
import { HeatmapChart } from "@/components/ui/heatmap-chart"
import { Block } from "@/components/ui/block"
import { GlideSelect } from "@/components/ui/glide-select"
import { datesFrom, longDate, monthBounds } from "@/lib/reports/dates"
import { count, percent } from "@/lib/reports/format"
import { occupancyMatrix, type SpanBooking } from "@/lib/reports/booking-window"
import { occupancyBands, occupancyFill } from "@/lib/reports/occupancy"

type Horizon = "7" | "14" | "month"
type Depth = "day" | "tables"

const horizons = [
  { value: "7", label: "7 Tage" },
  { value: "14", label: "14 Tage" },
  { value: "month", label: "Monat" },
] as const

const depths = [
  { value: "day", label: "Tag" },
  { value: "tables", label: "Tische" },
] as const

export function OccupancyPanel({
  rows,
  anchorDate,
  dates: datesProp,
  className,
}: {
  rows: SpanBooking[]
  anchorDate: string
  dates?: readonly string[]
  className?: string
}) {
  const [horizon, setHorizon] = useState<Horizon>("7")
  const [depth, setDepth] = useState<Depth>("day")
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedRow, setSelectedRow] = useState(0)

  const dates = datesProp && datesProp.length > 0 ? [...datesProp] : horizonDates(anchorDate, horizon)
  const heatmap = occupancyMatrix(rows, dates)
  const chartRows = depth === "day" ? [heatmap.house] : heatmap.rows
  const activeDate = selectedDate && dates.includes(selectedDate) ? selectedDate : dates.includes(anchorDate) ? anchorDate : dates[0]
  const column = activeDate ? dates.indexOf(activeDate) : 0
  const detail = depth === "tables" ? heatmap.rows[selectedRow] ?? heatmap.house : heatmap.house
  const ratio = detail.values[column] ?? 0
  const people = detail.people[column] ?? 0

  return (
    <Block
      className={className ? `occupancy-panel ${className}` : "occupancy-panel"}
      title="Tischauslastung"
      controls={
        <>
          {datesProp ? null : (
            <GlideSelect
              ariaLabel="Zeitraum"
              options={[...horizons]}
              value={horizon}
              showTags={false}
              size="md"
              variant="button"
              onChange={(next) => {
                if (next === "7" || next === "14" || next === "month") setHorizon(next)
              }}
            />
          )}
          <GlideSelect
            ariaLabel="Ansicht"
            options={[...depths]}
            value={depth}
            showTags={false}
            size="md"
            variant="button"
            onChange={(next) => {
              if (next === "day" || next === "tables") setDepth(next)
            }}
          />
        </>
      }
      legend={
        <>
          {occupancyBands.map((band) => (
            <span key={band.id} className="occupancy-band">
              <span style={{ background: band.bg, boxShadow: `inset 0 0 0 1px ${band.fg}` }} />
              {band.label} {band.range}
            </span>
          ))}
        </>
      }
      windowClassName="table-heatmap"
    >
      {activeDate ? (
        <div className="occupancy-readout">
          <p>{longDate(activeDate)}{depth === "tables" ? ` · ${detail.label}` : ""}</p>
          <div className="occupancy-meter" role="img" aria-label={`${percent(ratio)} gebucht`}>
            <div style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
          </div>
          <p className="fine-print">{percent(ratio)} gebucht · {count(people)} Personen auf {count(detail.seats)} Plätzen</p>
        </div>
      ) : null}
      <HeatmapChart
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
    </Block>
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
