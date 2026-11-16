export const occupancyBands = [
  { id: "gering", label: "Gering", min: 0, bg: "#eaf5ef", fg: "#33775a" },
  { id: "mittel", label: "Mittel", min: 0.4, bg: "#fff3d9", fg: "#926916" },
  { id: "hoch", label: "Hoch", min: 0.7, bg: "#fff0e7", fg: "#a7582c" },
  { id: "voll", label: "Fast voll", min: 0.9, bg: "color-mix(in srgb, var(--destructive) 18%, white)", fg: "var(--destructive)" },
] as const

export function bandFor(ratio: number): (typeof occupancyBands)[number] {
  let match: (typeof occupancyBands)[number] = occupancyBands[0]
  for (const band of occupancyBands) {
    if (ratio >= band.min) match = band
  }
  return match
}
