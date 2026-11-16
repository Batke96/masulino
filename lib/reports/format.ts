export function euro(value: number): string {
  return value.toLocaleString("de-DE", { style: "currency", currency: "EUR" })
}

export function count(value: number): string {
  return value.toLocaleString("de-DE", { maximumFractionDigits: value % 1 === 0 ? 0 : 1 })
}

export function percent(value: number): string {
  return value.toLocaleString("de-DE", { style: "percent", maximumFractionDigits: 1 })
}
