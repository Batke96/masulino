import { tableOccupancyHeatmap } from "../booking/tables"
import { addDays, change, datesFrom, monthBounds, shiftMonth } from "./dates"

export type SpanBooking = {
  id: string
  localDate: string
  localTime: string
  status: string
  organizerName: string
  packageName: string
  party: boolean
  childrenCount: number
  adultCount: number
  tables: string[]
  bookedValueMinor: number
  currency: string
}

const countedValue = new Set(["confirmed", "completed"])

export function rowsBetween(rows: readonly SpanBooking[], from: string, to: string): SpanBooking[] {
  return rows.filter((row) => row.localDate >= from && row.localDate <= to)
}

export function occupiesTable(row: SpanBooking): boolean {
  return row.status === "requested" || row.status === "confirmed" || row.status === "completed"
}

export function countedBookings(rows: readonly SpanBooking[]): SpanBooking[] {
  return rows.filter((row) => countedValue.has(row.status))
}

/** Promised package total in euros. Null when the rows do not share one currency. */
export function bookedEuros(rows: readonly SpanBooking[]): number | null {
  const valued = countedBookings(rows)
  if (valued.length === 0) return 0
  const currency = valued[0]?.currency
  if (!currency || valued.some((row) => row.currency !== currency)) return null
  return valued.reduce((sum, row) => sum + row.bookedValueMinor, 0) / 100
}

export type OccupancyDay = {
  date: string
  ratio: number
  people: number
  seats: number
}

export function occupancyMatrix(rows: readonly SpanBooking[], dates: readonly string[]) {
  return tableOccupancyHeatmap(
    dates,
    rows.filter(occupiesTable).map((row) => ({
      date: row.localDate,
      time: row.localTime,
      type: row.party ? "Geburtstag" : "Gruppe",
      tables: row.tables,
      children: row.childrenCount,
      adults: row.adultCount,
    })),
  )
}

export function occupancyDays(rows: readonly SpanBooking[], dates: readonly string[]): OccupancyDay[] {
  if (dates.length === 0) return []
  const heatmap = occupancyMatrix(rows, dates)
  return dates.map((date, index) => ({
    date,
    ratio: heatmap.house.values[index] ?? 0,
    people: heatmap.house.people[index] ?? 0,
    seats: heatmap.house.seats,
  }))
}

export function meanOccupancy(days: readonly OccupancyDay[]): number | null {
  if (days.length === 0) return null
  return days.reduce((sum, day) => sum + day.ratio, 0) / days.length
}

export type BookingWindow = {
  occupancyToday: number | null
  occupancy7: number | null
  bookings7: number
  bookingsPrevious7: number
  bookings7Delta: number | null
  bookedValue30: number | null
  bookings30: number
  children30: number
  partiesToday: SpanBooking[]
  partiesMonth: number
  partiesPreviousMonth: number
  partiesPreviousYear: number
  partyValueToday: number | null
  childrenToday: number
  adultsToday: number
  monthBookings: number
  monthChildren: number
  monthAdults: number
  monthPeople: number
  previousMonthPeople: number
  previousYearPeople: number
  monthBookedValue: number | null
  previousMonthBookedValue: number | null
  previousYearBookedValue: number | null
  monthBookingCount: number
  previousMonthBookingCount: number
  previousYearBookingCount: number
}

export function bookingWindow(rows: readonly SpanBooking[], today: string): BookingWindow {
  const month = today.slice(0, 7)
  const currentMonth = monthBounds(month)
  const previousMonth = monthBounds(shiftMonth(month, -1))
  const previousYear = monthBounds(shiftMonth(month, -12))
  const last7 = rowsBetween(rows, addDays(today, -6), today).filter(occupiesTable)
  const previous7 = rowsBetween(rows, addDays(today, -13), addDays(today, -7)).filter(occupiesTable)
  const next30 = countedBookings(rowsBetween(rows, today, addDays(today, 29)))
  const todayRows = rowsBetween(rows, today, today).filter(occupiesTable)
  const partiesToday = todayRows.filter((row) => row.party)
  const countedTodayParties = countedBookings(partiesToday)
  const monthRows = rowsBetween(rows, currentMonth.from, currentMonth.to).filter(occupiesTable)
  const previousMonthRows = rowsBetween(rows, previousMonth.from, previousMonth.to).filter(occupiesTable)
  const previousYearRows = rowsBetween(rows, previousYear.from, previousYear.to).filter(occupiesTable)
  const peopleOf = (list: readonly SpanBooking[]) =>
    list.reduce((sum, row) => sum + row.childrenCount + row.adultCount, 0)

  return {
    occupancyToday: meanOccupancy(occupancyDays(rows, [today])),
    occupancy7: meanOccupancy(occupancyDays(rows, datesFrom(today, 7))),
    bookings7: last7.length,
    bookingsPrevious7: previous7.length,
    bookings7Delta: change(last7.length, previous7.length),
    bookedValue30: bookedEuros(next30),
    bookings30: next30.length,
    children30: next30.reduce((sum, row) => sum + row.childrenCount, 0),
    partiesToday,
    partiesMonth: monthRows.filter((row) => row.party).length,
    partiesPreviousMonth: previousMonthRows.filter((row) => row.party).length,
    partiesPreviousYear: previousYearRows.filter((row) => row.party).length,
    partyValueToday: bookedEuros(countedTodayParties),
    childrenToday: partiesToday.reduce((sum, row) => sum + row.childrenCount, 0),
    adultsToday: partiesToday.reduce((sum, row) => sum + row.adultCount, 0),
    monthBookings: monthRows.length,
    monthChildren: monthRows.reduce((sum, row) => sum + row.childrenCount, 0),
    monthAdults: monthRows.reduce((sum, row) => sum + row.adultCount, 0),
    monthPeople: peopleOf(monthRows),
    previousMonthPeople: peopleOf(previousMonthRows),
    previousYearPeople: peopleOf(previousYearRows),
    monthBookedValue: bookedEuros(rowsBetween(rows, currentMonth.from, currentMonth.to)),
    previousMonthBookedValue: bookedEuros(rowsBetween(rows, previousMonth.from, previousMonth.to)),
    previousYearBookedValue: bookedEuros(rowsBetween(rows, previousYear.from, previousYear.to)),
    monthBookingCount: countedBookings(monthRows).length,
    previousMonthBookingCount: countedBookings(previousMonthRows).length,
    previousYearBookingCount: countedBookings(previousYearRows).length,
  }
}
