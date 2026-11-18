"use client"

import { useState } from "react"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { GlideSelect } from "@/components/ui/glide-select"
import { JellyButton } from "@/components/ui/jelly-button"
import { JellyRadio } from "@/components/ui/jelly-radio"
import { KpiCard } from "@/components/ui/kpi-card"
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
  const cardOptions = choices.map((choice, index) => ({
    value: String(index),
    label: `Karte ${index + 1}: ${evaluateSlot(facts, choice).label}`,
  }))
  const factOptions = facts.map((fact) => ({ value: fact.id, label: fact.label }))
  const denominatorOptions = [
    { value: "", label: "Kein Nenner" },
    ...facts.filter((fact) => fact.id !== numerator).map((fact) => ({ value: fact.id, label: fact.label })),
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <JellyButton variant="soft" onClick={() => { load(0); setOpen(true) }}>
          Bearbeiten
        </JellyButton>
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
            <GlideSelect
              options={cardOptions}
              value={String(position)}
              onChange={(next) => load(Number(next))}
              showTags={false}
              size="sm"
              ariaLabel="Karte"
            />
          </label>
          <JellyRadio
            items={[
              { value: "existing", label: "Bestehend" },
              { value: "compose", label: "Zusammensetzen" },
            ]}
            value={mode}
            onChange={(next) => {
              if (next === "existing" || next === "compose") setMode(next)
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
            ariaLabel="Art der Kennzahl"
          />
          {mode === "existing" ? (
            <label className="field-label">
              Kennzahl
              <GlideSelect
                options={factOptions}
                value={numerator}
                onChange={setNumerator}
                showTags={false}
                size="sm"
                ariaLabel="Bestehende Kennzahl"
              />
            </label>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field-label">
                Zähler
                <GlideSelect
                  options={factOptions}
                  value={numerator}
                  onChange={setNumerator}
                  showTags={false}
                  size="sm"
                  ariaLabel="Zähler"
                />
              </label>
              <label className="field-label">
                pro
                <GlideSelect
                  options={denominatorOptions}
                  value={denominator}
                  onChange={setDenominator}
                  showTags={false}
                  size="sm"
                  ariaLabel="Nenner"
                />
              </label>
            </div>
          )}
          <p className="text-sm text-muted-foreground">Vorschau: {preview.label} · {preview.display}</p>
          <DialogFooter>
            <DialogClose asChild>
              <JellyButton variant="soft">Abbrechen</JellyButton>
            </DialogClose>
            <JellyButton
              onClick={() => {
                onChange(position, draft)
                setOpen(false)
              }}
            >
              Übernehmen
            </JellyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
