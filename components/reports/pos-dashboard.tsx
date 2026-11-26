"use client"

import { useEffect, useState } from "react"
import { BuchungenTab } from "@/components/reports/buchungen-tab"
import { BesucherTab } from "@/components/reports/besucher-tab"
import { GeburtstageTab } from "@/components/reports/geburtstage-tab"
import { KasseTab } from "@/components/reports/kasse-tab"
import { ReportPeriodTools, ReportTabNav } from "@/components/reports/report-nav"
import { ZielTab } from "@/components/reports/ziel-tab"
import type { SpanBooking } from "@/lib/reports/booking-window"
import { monthBounds, reportSpan, shiftMonth } from "@/lib/reports/dates"
import { initialSlots, tabLabel, type SlotChoice, type TabId } from "@/lib/reports/measures"
import { toast } from "sonner"
import { fetchBootstrap, fetchPosReport, fetchReservationSpan, forgetPosReports, isWorkspaceMode, peekBootstrap, peekLastPosReport, peekPosReport, peekReservationSpan, syncPos, type PosReport } from "@/lib/workspace/client"

type LoadState = "loading" | "ready" | "empty" | "failed"
type PreviousState = "loading" | "ready" | "missing" | "failed"

function spanWindow(localDate: string, month?: string) {
  const aroundToday = reportSpan(localDate)
  const fromMonth = month ? `${shiftMonth(month, -12)}-01` : aroundToday.from
  const toMonth = month ? monthBounds(month).to : aroundToday.to
  return {
    from: fromMonth < aroundToday.from ? fromMonth : aroundToday.from,
    to: toMonth > aroundToday.to ? toMonth : aroundToday.to,
  }
}

function rememberedPrevious(locationId?: string, month?: string): { report: PosReport | null; state: PreviousState } | null {
  if (!month) return null
  const target = shiftMonth(month, -1)
  const next = peekPosReport({ locationId, month: target, view: "month" })
  if (!next) return null
  if (next.empty || next.month !== target) return { report: null, state: "missing" }
  return { report: next, state: "ready" }
}

function reportState(report: PosReport | null): LoadState {
  if (!report) return "loading"
  return report.empty ? "empty" : "ready"
}

export function PosDashboard() {
  const [tab, setTab] = useState<TabId>("kasse")
  const [slots, setSlots] = useState(initialSlots)
  const [view, setView] = useState<"month" | "year">("month")
  const [month, setMonth] = useState<string | undefined>(() => peekLastPosReport("month")?.month ?? undefined)
  const [locationId, setLocationId] = useState<string | undefined>(() => peekLastPosReport("month")?.locationId ?? peekBootstrap()?.locationId)
  const [localDate, setLocalDate] = useState<string | null>(() => peekBootstrap()?.localDate ?? null)
  const [clock, setClock] = useState<"loading" | "ready" | "failed">(() => (peekBootstrap() ? "ready" : "loading"))
  const [monthReport, setMonthReport] = useState<PosReport | null>(() => peekLastPosReport("month"))
  const [monthState, setMonthState] = useState<LoadState>(() => reportState(peekLastPosReport("month")))
  const [yearReport, setYearReport] = useState<PosReport | null>(() => peekLastPosReport("year"))
  const [yearState, setYearState] = useState<LoadState>(() => reportState(peekLastPosReport("year")))
  const [previous, setPrevious] = useState<PosReport | null>(() => {
    const current = peekLastPosReport("month")
    return rememberedPrevious(current?.locationId, current?.month ?? undefined)?.report ?? null
  })
  const [previousState, setPreviousState] = useState<PreviousState>(() => {
    const current = peekLastPosReport("month")
    return rememberedPrevious(current?.locationId, current?.month ?? undefined)?.state ?? "loading"
  })
  const [rows, setRows] = useState<SpanBooking[] | null>(() => {
    const date = peekBootstrap()?.localDate
    if (!date) return null
    const range = spanWindow(date, peekLastPosReport("month")?.month ?? undefined)
    return peekReservationSpan(range.from, range.to)
  })
  const [reloadTick, setReloadTick] = useState(0)
  const [reloading, setReloading] = useState(false)
  const [rowsState, setRowsState] = useState<"loading" | "ready" | "failed">(() => {
    const date = peekBootstrap()?.localDate
    if (!date) return "loading"
    const range = spanWindow(date, peekLastPosReport("month")?.month ?? undefined)
    return peekReservationSpan(range.from, range.to) ? "ready" : "loading"
  })

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
    void (async () => {
      if (!peekPosReport({ locationId, month, view: "month" })) setMonthState("loading")
      const next = await fetchPosReport({ locationId, month, view: "month", anchor: true })
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
  }, [locationId, month, reloadTick])

  useEffect(() => {
    if (!isWorkspaceMode() || view !== "year") return
    let cancelled = false
    const year = month?.slice(0, 4)
    const yearMonth = year ? `${year}-01` : undefined
    if (!peekPosReport({ locationId, month: yearMonth, view: "year" })) setYearState("loading")
    void (async () => {
      const next = await fetchPosReport({ locationId, month: yearMonth, view: "year", anchor: true })
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
  }, [locationId, month, view, reloadTick])

  useEffect(() => {
    if (!isWorkspaceMode() || !month) return
    let cancelled = false
    const target = shiftMonth(month, -1)
    if (!peekPosReport({ locationId, month: target, view: "month" })) setPreviousState("loading")
    void (async () => {
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
  }, [locationId, month, reloadTick])

  useEffect(() => {
    if (!isWorkspaceMode()) return
    if (clock === "failed") {
      setRowsState("failed")
      return
    }
    if (!localDate || clock !== "ready") return
    let cancelled = false
    const range = spanWindow(localDate, month)
    if (!peekReservationSpan(range.from, range.to)) setRowsState("loading")
    void (async () => {
      const next = await fetchReservationSpan(range.from, range.to)
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
  async function reloadTill() {
    if (reloading) return
    setReloading(true)
    const result = await syncPos()
    setReloading(false)
    if (!result.ok) {
      const description = result.error === "validation"
        ? "Der ready2order-Zugang fehlt. Es wurde nichts geschrieben."
        : result.error === "rate_limited"
          ? "ready2order begrenzt gerade die Abrufe. Es wurde nichts geschrieben."
          : "Es wurde nichts geschrieben."
      toast("Die Kasse konnte nicht nachgeladen werden.", { description })
      return
    }
    forgetPosReports()
    setReloadTick((value) => value + 1)
    toast(`${result.data.written.toLocaleString("de-DE")} Positionen nachgeladen.`)
  }

  const choose = (id: TabId) => (index: number, choice: SlotChoice) => {
    setSlots((current) => ({
      ...current,
      [id]: current[id].map((item, itemIndex) => (itemIndex === index ? choice : item)),
    }))
  }

  return (
    <div className="report-page">
      <div className="report-toolbar">
        <h2 className="report-toolbar-title">{tabLabel[tab]}</h2>
        <ReportTabNav value={tab} onChange={setTab} />
        <ReportPeriodTools
          tab={tab}
          view={view}
          onView={setView}
          month={month}
          onMonth={setMonth}
          report={monthReport}
          onReload={() => { void reloadTill() }}
          reloading={reloading}
        />
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
