import { count, euro, percent } from "./format"

export type FactUnit = "euro" | "count" | "ratio"

export type Fact = {
  id: string
  label: string
  /** Spoken after "pro", for example "Kind" in "Umsatz pro Kind". */
  per: string
  value: number | null
  unit: FactUnit
  delta?: number | null
  deltaLabel?: string
  trend?: number[]
}

export type SlotChoice = {
  numerator: string
  denominator: string | null
}

export type TabId = "kasse" | "buchungen" | "geburtstage" | "besucher" | "ziel"

export const tabOrder: TabId[] = ["kasse", "buchungen", "geburtstage", "besucher", "ziel"]

export const tabLabel: Record<TabId, string> = {
  kasse: "Kasse",
  buchungen: "Buchungen",
  geburtstage: "Geburtstage",
  besucher: "Besucher",
  ziel: "Ziel",
}

const catalogs: Record<TabId, string[]> = {
  kasse: [
    "gross",
    "payingChildren",
    "gastroGross",
    "receipts",
    "todayGross",
    "share:eintritt",
    "share:gastro",
    "share:geburtstag",
    "share:chips",
    "share:sonstiges",
  ],
  buchungen: ["occupancyToday", "occupancy7", "bookings7", "bookedValue30", "bookings30", "children30"],
  geburtstage: ["partiesToday", "childrenToday", "adultsToday", "partyValueToday"],
  besucher: ["payingChildren", "bookedPeople", "gross", "monthChildren", "monthBookings"],
  ziel: ["gross", "target", "variance"],
}

const defaults: Record<TabId, SlotChoice[]> = {
  kasse: [
    { numerator: "gross", denominator: null },
    { numerator: "payingChildren", denominator: null },
    { numerator: "gross", denominator: "payingChildren" },
    { numerator: "gastroGross", denominator: "payingChildren" },
  ],
  buchungen: [
    { numerator: "occupancyToday", denominator: null },
    { numerator: "occupancy7", denominator: null },
    { numerator: "bookings7", denominator: null },
    { numerator: "bookedValue30", denominator: null },
  ],
  geburtstage: [
    { numerator: "partiesToday", denominator: null },
    { numerator: "childrenToday", denominator: null },
    { numerator: "adultsToday", denominator: null },
    { numerator: "partyValueToday", denominator: null },
  ],
  besucher: [
    { numerator: "payingChildren", denominator: null },
    { numerator: "bookedPeople", denominator: null },
    { numerator: "gross", denominator: "payingChildren" },
    { numerator: "monthChildren", denominator: "monthBookings" },
  ],
  ziel: [
    { numerator: "gross", denominator: null },
    { numerator: "target", denominator: null },
    { numerator: "gross", denominator: "target" },
    { numerator: "variance", denominator: null },
  ],
}

export function catalogFor(tab: TabId): string[] {
  return catalogs[tab]
}

export function defaultChoices(tab: TabId): SlotChoice[] {
  return defaults[tab].map((choice) => ({ ...choice }))
}

export function initialSlots(): Record<TabId, SlotChoice[]> {
  return {
    kasse: defaultChoices("kasse"),
    buchungen: defaultChoices("buchungen"),
    geburtstage: defaultChoices("geburtstage"),
    besucher: defaultChoices("besucher"),
    ziel: defaultChoices("ziel"),
  }
}

export type SlotMetric = {
  label: string
  display: string
  delta?: number
  deltaLabel?: string
  trend?: number[]
}

export function evaluateSlot(facts: readonly Fact[], choice: SlotChoice): SlotMetric {
  const numerator = facts.find((fact) => fact.id === choice.numerator)
  const denominator = choice.denominator ? facts.find((fact) => fact.id === choice.denominator) : null
  if (!numerator) return { label: "Kennzahl", display: "—" }
  if (!denominator) {
    return withTrend({
      label: numerator.label,
      display: formatFact(numerator.value, numerator.unit),
      delta: numerator.delta ?? undefined,
      deltaLabel: numerator.deltaLabel,
    }, series(numerator.trend))
  }
  const label = `${numerator.label} pro ${denominator.per}`
  if (numerator.value === null || denominator.value === null || denominator.value === 0) {
    return { label, display: "—" }
  }
  const value = numerator.value / denominator.value
  const format = pairFormat(numerator.unit, denominator.unit)
  return withTrend({ label, display: formatFact(value, format) }, ratioSeries(numerator.trend, denominator.trend))
}

function withTrend(metric: SlotMetric, trend: number[] | undefined): SlotMetric {
  return trend ? { ...metric, trend } : metric
}

function series(values: number[] | undefined): number[] | undefined {
  return values && values.length > 1 ? values : undefined
}

function ratioSeries(numerator: number[] | undefined, denominator: number[] | undefined): number[] | undefined {
  if (!numerator || !denominator || numerator.length !== denominator.length || numerator.length < 2) return undefined
  return numerator.map((value, index) => {
    const base = denominator[index] ?? 0
    return base === 0 ? 0 : value / base
  })
}

function pairFormat(numerator: FactUnit, denominator: FactUnit): FactUnit {
  if (numerator === "euro" && denominator === "count") return "euro"
  if (numerator === "euro" && denominator === "euro") return "ratio"
  return "count"
}

function formatFact(value: number | null, unit: FactUnit): string {
  if (value === null || !Number.isFinite(value)) return "—"
  if (unit === "euro") return euro(value)
  if (unit === "ratio") return percent(value)
  return count(value)
}

export function factsInCatalog(tab: TabId, facts: readonly Fact[]): Fact[] {
  const byId = new Map(facts.map((fact) => [fact.id, fact]))
  return catalogs[tab].flatMap((id) => {
    const fact = byId.get(id)
    return fact ? [fact] : []
  })
}
