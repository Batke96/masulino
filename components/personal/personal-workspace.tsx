"use client"

import type { ReactNode } from "react"
import { CalendarCheck, CalendarDays, Info, Settings2, Timer, Users, UsersRound } from "lucide-react"

import "./personal.css"
import { DienstplanTab } from "./dienstplan-tab"
import { MitarbeiterTab } from "./mitarbeiter-tab"
import { PersonalProvider, usePersonal, type PersonalTab } from "./personal-context"
import { Pill } from "./personal-ui"
import { RegelnTab } from "./regeln-tab"
import { SegmentNav } from "./segment-nav"
import { VerfuegbarkeitTab } from "./verfuegbarkeit-tab"
import { ZeiterfassungTab } from "./zeiterfassung-tab"

const icon = { size: 16, strokeWidth: 1.8, "aria-hidden": true } as const

const tabs: { value: PersonalTab; label: string; icon: ReactNode }[] = [
  { value: "dienstplan", label: "Dienstplan", icon: <CalendarDays {...icon} /> },
  { value: "mitarbeiter", label: "Mitarbeiter", icon: <UsersRound {...icon} /> },
  { value: "verfuegbarkeit", label: "Verfügbarkeit", icon: <CalendarCheck {...icon} /> },
  { value: "zeiterfassung", label: "Zeiterfassung", icon: <Timer {...icon} /> },
  { value: "regeln", label: "Regeln", icon: <Settings2 {...icon} /> },
]

export function PersonalWorkspace() {
  return (
    <PersonalProvider>
      <PersonalShell />
    </PersonalProvider>
  )
}

function PersonalShell() {
  const { tab, setTab, state, weekId } = usePersonal()
  const published = state.plans[weekId]?.status === "veroeffentlicht"
  return (
    <div className="personal">
      <header className="personal-header">
        <span className="icon-tile orange" aria-hidden="true">
          <Users size={23} strokeWidth={1.8} />
        </span>
        <div>
          <h2>Personal</h2>
          <p>Masulino Wiesbaden · Interaktive Demo</p>
        </div>
        <Pill tone={published ? "green" : "amber"}>{published ? "Veröffentlicht (Demo)" : "Entwurf"}</Pill>
      </header>
      <SegmentNav label="Bereich im Personalbereich" items={tabs} value={tab} onChange={setTab} className="personal-nav" />
      <div className="personal-panel" key={tab}>
        {tab === "dienstplan" ? <DienstplanTab /> : null}
        {tab === "mitarbeiter" ? <MitarbeiterTab /> : null}
        {tab === "verfuegbarkeit" ? <VerfuegbarkeitTab /> : null}
        {tab === "zeiterfassung" ? <ZeiterfassungTab /> : null}
        {tab === "regeln" ? <RegelnTab /> : null}
      </div>
      <p className="info-inline personal-demo-note">
        <Info size={17} strokeWidth={1.8} aria-hidden="true" />
        Interaktive Demo mit Beispieldaten. Pläne, Zeiten und Korrekturen bleiben in diesem Browser; es wird nichts gesendet, gespeichert oder abgerechnet.
      </p>
    </div>
  )
}
