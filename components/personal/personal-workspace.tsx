"use client"

import { useLayoutEffect, useState } from "react"
import { createPortal } from "react-dom"

import { ActionButton } from "@/components/ui/row-action"
import { GlideSelect } from "@/components/ui/glide-select"
import { formatWeekRange, planningWeekTag } from "@/lib/personal"

import "./personal.css"
import { AvailabilityDialog } from "./availability-dialog"
import { DienstplanTab } from "./dienstplan-tab"
import { MitarbeiterTab } from "./mitarbeiter-tab"
import { PersonalProvider, usePersonal, type PersonalTab } from "./personal-context"
import { RegelnTab } from "./regeln-tab"
import { ZeiterfassungTab } from "./zeiterfassung-tab"

const areas: { value: PersonalTab; label: string }[] = [
  { value: "dienstplan", label: "Dienstplan" },
  { value: "mitarbeiter", label: "Mitarbeiter" },
  { value: "zeiterfassung", label: "Zeiterfassung" },
  { value: "regeln", label: "Regeln" },
]

function isArea(value: string): value is PersonalTab {
  return areas.some((item) => item.value === value)
}

export function PersonalWorkspace() {
  return (
    <PersonalProvider>
      <PersonalShell />
    </PersonalProvider>
  )
}

function PersonalShell() {
  const { tab, setTab, weeks, weekId, setWeekId, startNewEmployee } = usePersonal()
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    setSlot(document.getElementById("personal-area-slot"))
  }, [])
  const label = areas.find((item) => item.value === tab)?.label ?? "Dienstplan"
  const areaSelect = (
    <GlideSelect
      ariaLabel="Bereich im Personalbereich"
      variant="button"
      align="right"
      showTags={false}
      size="md"
      value={tab}
      onChange={(next) => {
        if (isArea(next)) setTab(next)
      }}
      options={areas.map((item) => ({ value: item.value, label: item.label }))}
    />
  )
  return (
    <div className="personal">
      {slot ? createPortal(areaSelect, slot) : null}
      <div className="personal-head">
        <h2 className="personal-title">{label}</h2>
        {tab === "dienstplan" ? (
          <div className="personal-week">
            <GlideSelect
              ariaLabel="Woche"
              variant="button"
              align="right"
              size="md"
              value={weekId}
              onChange={setWeekId}
              options={weeks.map((item, index) => {
                const tag = planningWeekTag(index)
                const range = formatWeekRange(item.start, item.end)
                return tag ? { value: item.id, label: range, tag } : { value: item.id, label: range }
              })}
            />
          </div>
        ) : null}
        {tab === "mitarbeiter" ? (
          <div className="personal-head-action">
            <ActionButton action="add" variant="icon" label="Mitarbeiter hinzufügen" onClick={startNewEmployee} />
          </div>
        ) : null}
      </div>
      <div className="personal-panel" key={tab}>
        {tab === "dienstplan" ? <DienstplanTab /> : null}
        {tab === "mitarbeiter" ? <MitarbeiterTab /> : null}
        {tab === "zeiterfassung" ? <ZeiterfassungTab /> : null}
        {tab === "regeln" ? <RegelnTab /> : null}
      </div>
      <AvailabilityDialog />
    </div>
  )
}

