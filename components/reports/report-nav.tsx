"use client"

import { useLayoutEffect, useState } from "react"
import { createPortal } from "react-dom"
import { ActionButton } from "@/components/ui/row-action"
import { GlideSelect } from "@/components/ui/glide-select"
import { monthTitle } from "@/lib/reports/dates"
import { tabLabel, tabOrder, type TabId } from "@/lib/reports/measures"
import type { PosReport } from "@/lib/workspace/client"

const tabItems = tabOrder.map((id) => ({ value: id, label: tabLabel[id] }))

function isTab(value: string): value is TabId {
  return tabOrder.includes(value as TabId)
}

export function ReportTabNav({
  value,
  onChange,
}: {
  value: TabId
  onChange: (tab: TabId) => void
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    setSlot(document.getElementById("report-area-slot"))
  }, [])
  if (!slot) return null
  return createPortal(
    <GlideSelect
      options={tabItems}
      value={value}
      onChange={(next) => {
        if (isTab(next)) onChange(next)
      }}
      showTags={false}
      variant="button"
      size="md"
      ariaLabel="Auswertung"
      align="right"
    />,
    slot,
  )
}

export function ReportPeriodTools({
  tab,
  view,
  onView,
  month,
  onMonth,
  report,
  onReload,
  reloading,
}: {
  tab: TabId
  view: "month" | "year"
  onView: (view: "month" | "year") => void
  month: string | undefined
  onMonth: (month: string) => void
  report: PosReport | null
  onReload?: () => void
  reloading?: boolean
}) {
  if (tab !== "kasse" && tab !== "besucher" && tab !== "ziel") return null
  const period = report && (report.months.length > 0 || report.years.length > 0) ? report : null
  if (!period && tab !== "kasse") return null
  const yearMode = tab === "kasse" && view === "year"
  const monthValue = period?.month ?? month ?? ""
  const yearValue = month?.slice(0, 4) ?? ""

  return (
    <div className="report-toolbar-tools">
      {period && tab === "kasse" ? (
        <GlideSelect
          options={[
            { value: "month", label: "Monat" },
            { value: "year", label: "Jahr" },
          ]}
          value={view}
          onChange={(next) => {
            if (next === "month" || next === "year") onView(next)
          }}
          showTags={false}
          size="md"
          variant="button"
          ariaLabel="Zeitraum"
          align="right"
        />
      ) : null}
      {period && yearMode ? (
        <GlideSelect
          options={period.years.map((item) => ({ value: String(item), label: String(item) }))}
          value={yearValue}
          onChange={(next) => onMonth(`${next}-01`)}
          showTags={false}
          size="md"
          variant="button"
          ariaLabel="Jahr"
          align="right"
        />
      ) : null}
      {period && !yearMode ? (
        <GlideSelect
          options={period.months.map((item) => ({ value: item, label: monthTitle(item) }))}
          value={monthValue}
          onChange={onMonth}
          showTags={false}
          size="md"
          variant="button"
          ariaLabel="Monat"
          align="right"
        />
      ) : null}
      {tab === "kasse" && onReload ? (
        <ActionButton action="reload" variant="soft" disabled={reloading} onClick={onReload} />
      ) : null}
    </div>
  )
}
