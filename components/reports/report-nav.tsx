"use client"

import { GlideSelect } from "@/components/ui/glide-select"
import { JellyRadio } from "@/components/ui/jelly-radio"
import { monthTitle } from "@/lib/reports/dates"
import { tabLabel, tabOrder, type TabId } from "@/lib/reports/measures"
import type { PosReport } from "@/lib/workspace/client"

const tabItems = tabOrder.map((id) => ({ value: id, label: tabLabel[id] }))

const jellyTone = {
  chipColor: "var(--muted)",
  activeColor: "var(--ink)",
  textColor: "var(--text-secondary)",
  activeTextColor: "var(--primary-foreground)",
} as const

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
  return (
    <div className="period-toggle report-tab-nav">
      <div className="period-toggle-pills">
        <JellyRadio
          items={tabItems}
          value={value}
          onChange={(next) => {
            if (isTab(next)) onChange(next)
          }}
          {...jellyTone}
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
          ariaLabel="Auswertung"
        />
      </div>
      <div className="period-toggle-select">
        <GlideSelect
          options={tabItems}
          value={value}
          onChange={(next) => {
            if (isTab(next)) onChange(next)
          }}
          showTags={false}
          size="sm"
          ariaLabel="Auswertung"
          align="left"
        />
      </div>
    </div>
  )
}

export function ReportPeriodTools({
  tab,
  view,
  onView,
  month,
  onMonth,
  report,
}: {
  tab: TabId
  view: "month" | "year"
  onView: (view: "month" | "year") => void
  month: string | undefined
  onMonth: (month: string) => void
  report: PosReport | null
}) {
  if (tab !== "kasse" && tab !== "besucher" && tab !== "ziel") return null
  if (!report || (report.months.length === 0 && report.years.length === 0)) return null
  const yearMode = tab === "kasse" && view === "year"
  const monthValue = report.month ?? month ?? ""
  const yearValue = month?.slice(0, 4) ?? ""

  return (
    <div className="report-toolbar-tools">
      {tab === "kasse" ? (
        <JellyRadio
          items={[
            { value: "month", label: "Monat" },
            { value: "year", label: "Jahr" },
          ]}
          value={view}
          onChange={(next) => {
            if (next === "month" || next === "year") onView(next)
          }}
          {...jellyTone}
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
          ariaLabel="Zeitraum"
        />
      ) : null}
      {yearMode ? (
        <GlideSelect
          className="period-choice"
          options={report.years.map((item) => ({ value: String(item), label: String(item) }))}
          value={yearValue}
          onChange={(next) => onMonth(`${next}-01`)}
          showTags={false}
          size="sm"
          ariaLabel="Jahr"
          align="right"
        />
      ) : (
        <GlideSelect
          className="period-choice"
          options={report.months.map((item) => ({ value: item, label: monthTitle(item) }))}
          value={monthValue}
          onChange={onMonth}
          showTags={false}
          size="sm"
          ariaLabel="Monat"
          align="right"
        />
      )}
    </div>
  )
}
