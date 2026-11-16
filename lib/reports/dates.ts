export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(year!, (month ?? 1) - 1, (day ?? 1) + days))
  return date.toISOString().slice(0, 10)
}

export function shiftMonth(month: string, delta: number): string {
  const [yearText, monthText] = month.split("-")
  const cursor = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + delta, 1))
  return `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

export function isWeekend(date: string): boolean {
  const day = weekdayOf(date)
  return day === 0 || day === 6
}

export function datesFrom(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(start, index))
}

export function monthBounds(month: string): { from: string; to: string } {
  const from = `${month}-01`
  const to = addDays(`${shiftMonth(month, 1)}-01`, -1)
  return { from, to }
}

export function change(current: number, previous: number): number | null {
  if (previous === 0) return null
  return (current - previous) / previous
}

export function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function shortWeekday(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" })
    .format(new Date(`${iso}T00:00:00Z`))
    .replace(/\.$/, "")
}

const monthNames = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
]

export function monthTitle(month: string): string {
  const [year, index] = month.split("-")
  return `${monthNames[Number(index) - 1] ?? month} ${year}`
}

export function reportSpan(today: string): { from: string; to: string } {
  return { from: addDays(today, -370), to: addDays(today, 31) }
}
