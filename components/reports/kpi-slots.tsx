"use client"

import { useState } from "react"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { KpiCard } from "@/components/ui/kpi-card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { evaluateSlot, type Fact, type SlotChoice } from "@/lib/reports/measures"

export function KpiSlots({
  facts,
  choices,
  onChange,
}: {
  facts: Fact[]
  choices: SlotChoice[]
  onChange: (index: number, choice: SlotChoice) => void
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(0)
  const [mode, setMode] = useState<"existing" | "compose">("existing")
  const [numerator, setNumerator] = useState("")
  const [denominator, setDenominator] = useState("")

  function load(index: number) {
    const current = choices[index]
    setPosition(index)
    setMode(current?.denominator ? "compose" : "existing")
    setNumerator(current?.numerator ?? facts[0]?.id ?? "")
    setDenominator(current?.denominator ?? "")
  }

  const draft: SlotChoice = mode === "existing"
    ? { numerator, denominator: null }
    : { numerator, denominator: denominator && denominator !== numerator ? denominator : null }
  const preview = evaluateSlot(facts, draft)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button type="button" className="button soft" onClick={() => { load(0); setOpen(true) }}>
          Bearbeiten
        </button>
      </div>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Kennzahlen">
        {choices.map((choice, index) => {
          const metric = evaluateSlot(facts, choice)
          return (
            <KpiCard
              key={index}
              label={metric.label}
              value={metric.display}
              delta={metric.delta}
              deltaLabel={metric.deltaLabel}
              trend={metric.trend}
            />
          )
        })}
      </section>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Kennzahl</DialogTitle>
            <DialogDescription>
              Eine bestehende Kennzahl auswählen oder aus Zähler und Nenner zusammensetzen. Die Karte bleibt unverändert, bis du übernimmst.
            </DialogDescription>
          </DialogHeader>
          <label className="field-label">
            Karte
            <select aria-label="Karte" value={position} onChange={(event) => load(Number(event.target.value))}>
              {choices.map((choice, index) => (
                <option key={index} value={index}>Karte {index + 1}: {evaluateSlot(facts, choice).label}</option>
              ))}
            </select>
          </label>
          <Tabs value={mode} onValueChange={(next) => { if (next === "existing" || next === "compose") setMode(next) }}>
            <TabsList aria-label="Art der Kennzahl">
              <TabsTrigger value="existing">Bestehend</TabsTrigger>
              <TabsTrigger value="compose">Zusammensetzen</TabsTrigger>
            </TabsList>
          </Tabs>
          {mode === "existing" ? (
            <label className="field-label">
              Kennzahl
              <select aria-label="Bestehende Kennzahl" value={numerator} onChange={(event) => setNumerator(event.target.value)}>
                {facts.map((fact) => (
                  <option key={fact.id} value={fact.id}>{fact.label}</option>
                ))}
              </select>
            </label>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field-label">
                Zähler
                <select aria-label="Zähler" value={numerator} onChange={(event) => setNumerator(event.target.value)}>
                  {facts.map((fact) => (
                    <option key={fact.id} value={fact.id}>{fact.label}</option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                pro
                <select aria-label="Nenner" value={denominator} onChange={(event) => setDenominator(event.target.value)}>
                  <option value="">Kein Nenner</option>
                  {facts.filter((fact) => fact.id !== numerator).map((fact) => (
                    <option key={fact.id} value={fact.id}>{fact.label}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <p className="text-sm text-muted-foreground">Vorschau: {preview.label} · {preview.display}</p>
          <DialogFooter>
            <DialogClose asChild>
              <button type="button" className="button soft">Abbrechen</button>
            </DialogClose>
            <button
              type="button"
              className="button dark"
              onClick={() => {
                onChange(position, draft)
                setOpen(false)
              }}
            >
              Übernehmen
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
