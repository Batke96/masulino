export const occupancyBands = [
  { id: "gering", label: "Gering", range: "ab 5 %", min: 0.05, bg: "var(--success-bg)", fg: "var(--success)" },
  { id: "mittel", label: "Mittel", range: "ab 20 %", min: 0.2, bg: "var(--warning-bg)", fg: "var(--warning)" },
  { id: "hoch", label: "Hoch", range: "ab 40 %", min: 0.4, bg: "var(--status-high-bg)", fg: "var(--status-high)" },
  { id: "voll", label: "Fast voll", range: "ab 70 %", min: 0.7, bg: "var(--destructive-bg)", fg: "var(--destructive)" },
] as const

const emptyFill = "var(--muted)"

export function bandFor(ratio: number): (typeof occupancyBands)[number] | null {
  if (!Number.isFinite(ratio)) return null
  let match: (typeof occupancyBands)[number] | null = null
  for (const band of occupancyBands) {
    if (ratio >= band.min) match = band
  }
  return match
}

export function occupancyFill(ratio: number): string {
  return bandFor(ratio)?.bg ?? emptyFill
}
