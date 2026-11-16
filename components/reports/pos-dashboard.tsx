"use client"

import { useEffect, useState } from "react"
import { BuchungenTab } from "@/components/reports/buchungen-tab"
import { BesucherTab } from "@/components/reports/besucher-tab"
import { GeburtstageTab } from "@/components/reports/geburtstage-tab"
import { KasseTab } from "@/components/reports/kasse-tab"
import { ZielTab } from "@/components/reports/ziel-tab"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { SpanBooking } from "@/lib/reports/booking-window"
import { monthBounds, monthTitle, reportSpan, shiftMonth } from "@/lib/reports/dates"
import { initialSlots, tabLabel, tabOrder, type SlotChoice, type TabId } from "@/lib/reports/measures"
import { fetchBootstrap, fetchPosReport, fetchReservationSpan, isWorkspaceMode, type PosReport } from "@/lib/workspace/client"

type LoadState = "loading" | "ready" | "empty" | "failed"
type PreviousState = "loading" | "ready" | "missing" | "failed"

export function PosDashboard() {
  const [tab, setTab] = useState<TabId>("kasse")
  const [slots, setSlots] = useState(initialSlots)
  const [view, setView] = useState<"month" | "year">("month")
  const [month, setMonth] = useState<string | undefined>()
  const [locationId, setLocationId] = useState<string | undefined>()
  const [localDate, setLocalDate] = useState<string | null>(null)
  const [clock, setClock] = useState<"loading" | "ready" | "failed">("loading")
  const [monthReport, setMonthReport] = useState<PosReport | null>(null)
  const [monthState, setMonthState] = useState<LoadState>("loading")
  const [yearReport, setYearReport] = useState<PosReport | null>(null)
  const [yearState, setYearState] = useState<LoadState>("loading")
  const [previous, setPrevious] = useState<PosReport | null>(null)
  const [previousState, setPreviousState] = useState<PreviousState>("loading")
  const [rows, setRows] = useState<SpanBooking[] | null>(null)
  const [rowsState, setRowsState] = useState<"loading" | "ready" | "failed">("loading")

  useEffect(() => {
    if (!isWorkspaceMode()) return
    let cancelled = false
    void (async () => {
      const bootstrap = await fetchBootstrap()
      if (cancelled) return
      if (!bootstrap) {
        setClock("failed")
        return
      }
      setLocalDate(bootstrap.localDate)
      setLocationId((current) => current ?? bootstrap.locationId)
      setClock("ready")
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isWorkspaceMode()) return
    let cancelled = false
    setMonthState("loading")
    void (async () => {
      const next = await fetchPosReport({ locationId, month, view: "month" })
      if (cancelled) return
      if (!next) {
        setMonthState("failed")
        return
      }
      setMonthReport(next)
      setMonthState(next.empty ? "empty" : "ready")
      if (!month && next.month) setMonth(next.month)
      if (!locationId && next.locationId) setLocationId(next.locationId)
    })()
    return () => {
      cancelled = true
    }
  }, [locationId, month])

  useEffect(() => {
    if (!isWorkspaceMode() || view !== "year") return
    let cancelled = false
    setYearState("loading")
    void (async () => {
      const year = month?.slice(0, 4)
      const next = await fetchPosReport({ locationId, month: year ? `${year}-01` : undefined, view: "year" })
      if (cancelled) return
      if (!next) {
        setYearState("failed")
        setYearReport(null)
        return
      }
      setYearReport(next)
      setYearState(next.empty ? "empty" : "ready")
    })()
    return () => {
      cancelled = true
    }
  }, [locationId, month, view])

  useEffect(() => {
    if (!isWorkspaceMode() || !month) return
    let cancelled = false
    setPreviousState("loading")
    void (async () => {
      const target = shiftMonth(month, -1)
      const next = await fetchPosReport({ locationId, month: target, view: "month" })
      if (cancelled) return
      if (!next) {
        setPrevious(null)
        setPreviousState("failed")
        return
      }
      if (next.empty || next.month !== target) {
        setPrevious(null)
        setPreviousState("missing")
        return
      }
      setPrevious(next)
      setPreviousState("ready")
    })()
    return () => {
      cancelled = true
    }
  }, [locationId, month])

  useEffect(() => {
    if (!isWorkspaceMode()) return
    if (clock === "failed") {
      setRowsState("failed")
      return
    }
    if (!localDate || clock !== "ready") return
    let cancelled = false
    setRowsState("loading")
    void (async () => {
      const aroundToday = reportSpan(localDate)
      const fromMonth = month ? `${shiftMonth(month, -12)}-01` : aroundToday.from
      const toMonth = month ? monthBounds(month).to : aroundToday.to
      const from = fromMonth < aroundToday.from ? fromMonth : aroundToday.from
      const to = toMonth > aroundToday.to ? toMonth : aroundToday.to
      const next = await fetchReservationSpan(from, to)
      if (cancelled) return
      if (!next) {
        setRowsState("failed")
        return
      }
      setRows(next)
      setRowsState("ready")
    })()
    return () => {
      cancelled = true
    }
  }, [localDate, month, clock])

  if (!isWorkspaceMode()) {
    return (
      <section className="surface">
        <div className="section-head"><h2>Auswertungen</h2></div>
        <p>Der Kassenumsatz erscheint hier nach der Anmeldung und dem Import der Kassenpositionen.</p>
      </section>
    )
  }

  const kasseReport = view === "year" ? yearReport : monthReport
  const kasseState = view === "year" ? yearState : monthState
  const choose = (id: TabId) => (index: number, choice: SlotChoice) => {
    setSlots((current) => ({
      ...current,
      [id]: current[id].map((item, itemIndex) => (itemIndex === index ? choice : item)),
    }))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="report-toolbar">
        <Tabs className="w-fit" value={tab} onValueChange={(next) => { if (isTab(next)) setTab(next) }}>
          <TabsList aria-label="Auswertung">
            {tabOrder.map((id) => (
              <TabsTrigger key={id} value={id}>{tabLabel[id]}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <PeriodTools tab={tab} view={view} onView={setView} month={month} onMonth={setMonth} report={monthReport} />
      </div>
      {tab === "kasse" ? (
        <KasseTab
          report={kasseReport}
          state={kasseState}
          previous={previous}
          previousState={previousState}
          localDate={localDate}
          view={view}
          choices={slots.kasse}
          onChoice={choose("kasse")}
        />
      ) : null}
      {tab === "buchungen" ? (
        <BuchungenTab rows={rows} state={rowsState} localDate={localDate} clock={clock} choices={slots.buchungen} onChoice={choose("buchungen")} />
      ) : null}
      {tab === "geburtstage" ? (
        <GeburtstageTab rows={rows} state={rowsState} localDate={localDate} clock={clock} choices={slots.geburtstage} onChoice={choose("geburtstage")} />
      ) : null}
      {tab === "besucher" ? (
        <BesucherTab
          report={monthReport}
          reportState={monthState}
          rows={rows}
          rowsState={rowsState}
          localDate={localDate}
          clock={clock}
          choices={slots.besucher}
          onChoice={choose("besucher")}
        />
      ) : null}
      {tab === "ziel" ? (
        <ZielTab
          report={monthReport}
          state={monthState}
          previous={previous}
          previousState={previousState}
          choices={slots.ziel}
          onChoice={choose("ziel")}
        />
      ) : null}
    </div>
  )
}

function isTab(value: string): value is TabId {
  return tabOrder.includes(value as TabId)
}

function PeriodTools({
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
  return (
    <div className="report-toolbar-tools">
      {tab === "kasse" ? (
        <Tabs className="w-fit" value={view} onValueChange={(next) => { if (next === "month" || next === "year") onView(next) }}>
          <TabsList aria-label="Zeitraum">
            <TabsTrigger value="month">Monat</TabsTrigger>
            <TabsTrigger value="year">Jahr</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
      {yearMode ? (
        <select className="period-choice" aria-label="Jahr" value={month?.slice(0, 4) ?? ""} onChange={(event) => onMonth(`${event.target.value}-01`)}>
          {report.years.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      ) : (
        <select className="period-choice" aria-label="Monat" value={report.month ?? month ?? ""} onChange={(event) => onMonth(event.target.value)}>
          {report.months.map((item) => <option key={item} value={item}>{monthTitle(item)}</option>)}
        </select>
      )}
    </div>
  )
}
