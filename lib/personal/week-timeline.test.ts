import { describe, expect, it } from "vitest"
import { defaultRules, openingOf, type PlanBooking, type PlanDay, type Shift } from "./index"
import { dayTimeline, markLetter, timelineOffset, weekAxis } from "./week-timeline"

const monday = "2026-11-02"

function bareDay(date: string, bookings: PlanBooking[] = []): PlanDay {
  return { date, weather: { temperature: 10, rainPercent: 0, symbol: "sonne" }, bookings }
}

function booking(id: string, start: number, end: number, kind: PlanBooking["kind"] = "geburtstag"): PlanBooking {
  return { id, kind, name: id, start, end, children: 1, adults: 1 }
}

function shift(id: string, employeeId: string, start: number, end: number, date = monday): Shift {
  return { id, employeeId, date, start, end, kind: "service", origin: "manuell" }
}

describe("Zeitstrahl", () => {
  it("nimmt bei Mitarbeiter den Kennbuchstaben, sonst den ersten Buchstaben", () => {
    expect(markLetter("Mehdi")).toBe("M")
    expect(markLetter("omar")).toBe("O")
    expect(markLetter("Tugba")).toBe("T")
    expect(markLetter("Mitarbeiter A")).toBe("A")
    expect(markLetter("mitarbeiter b")).toBe("B")
    expect(markLetter("  ")).toBe("?")
  })

  it("spannt die Achse über Öffnung, Buchung und Schicht und rastet auf 30 Minuten ein", () => {
    const opening = openingOf(monday)!
    const quiet = weekAxis([bareDay(monday)], [])
    expect(quiet.start).toBe(opening.start)
    expect(quiet.end).toBe(opening.end)
    expect(quiet.ticks.find((tick) => tick.minute === opening.start)?.label).toBe("14:00")
    expect(quiet.ticks.find((tick) => tick.minute === opening.start + 30)?.label).toBeNull()

    const busy = weekAxis(
      [bareDay(monday, [booking("kita", 9 * 60, 13 * 60, "kita")])],
      [shift("early", "md", 8 * 60 + 20, 10 * 60), shift("late", "me", 18 * 60, 19 * 60 + 10)],
    )
    expect(busy.start).toBe(8 * 60)
    expect(busy.end).toBe(19 * 60 + 30)
  })

  it("ignoriert Schichten außerhalb der Woche und fällt ohne Tage auf 10:00–19:00 zurück", () => {
    const opening = openingOf(monday)!
    const axis = weekAxis([bareDay(monday)], [shift("other", "me", 8 * 60, 9 * 60, "2026-11-03")])
    expect(axis.start).toBe(opening.start)
    expect(weekAxis([], []).start).toBe(10 * 60)
    expect(weekAxis([], []).end).toBe(19 * 60)
  })

  it("legt 16:30 in die Mitte einer Achse von 14:00 bis 19:00", () => {
    const axis = weekAxis([bareDay(monday)], [])
    expect(timelineOffset(axis, 16 * 60 + 30)).toBe(50)
    expect(timelineOffset(axis, axis.start)).toBe(0)
    expect(timelineOffset(axis, axis.end)).toBe(100)
  })

  it("legt überlappende Schichten nebeneinander und teilt eine Spur, wenn sie sich nicht treffen", () => {
    const rules = defaultRules()
    const employees = [
      { id: "me", name: "Mehdi" },
      { id: "ma", name: "Mitarbeiter A" },
      { id: "mf", name: "Omar" },
    ]
    const overlapped = dayTimeline(
      bareDay(monday),
      [shift("1", "me", 10 * 60, 19 * 60), shift("2", "ma", 14 * 60, 19 * 60), shift("3", "mf", 10 * 60, 16 * 60)],
      employees,
      rules,
    )
    expect(overlapped.shifts.map((item) => [item.letter, item.lane])).toEqual([
      ["M", 0],
      ["O", 1],
      ["A", 2],
    ])
    expect(overlapped.shiftLanes).toBe(3)

    const gapped = dayTimeline(
      bareDay(monday),
      [shift("a", "me", 10 * 60, 12 * 60), shift("b", "me", 14 * 60, 16 * 60)],
      employees,
      rules,
    )
    expect(gapped.shifts).toHaveLength(2)
    expect(gapped.shiftLanes).toBe(1)
    expect(gapped.shifts.every((item) => item.letter === "M" && item.lane === 0 && item.role === "mitarbeiter")).toBe(true)

    const lead = dayTimeline(bareDay(monday), [shift("lead", "lt", 10 * 60, 16 * 60)], [{ id: "lt", name: "Leitung", role: "leitung" }], rules)
    expect(lead.shifts[0]?.role).toBe("leitung")
  })

  it("zeichnet ein Bracket pro gleichem Beginn und Ende", () => {
    const rules = defaultRules()
    const column = dayTimeline(
      bareDay(monday, [booking("Familie Weber", 14 * 60 + 30, 16 * 60 + 30), booking("Familie Yilmaz", 14 * 60 + 30, 16 * 60 + 30)]),
      [],
      [],
      rules,
    )
    expect(column.bookings).toHaveLength(1)
    expect(column.bookings[0]).toMatchObject({
      birthdays: 2,
      kita: 0,
      lane: 0,
      names: ["Familie Weber", "Familie Yilmaz"],
    })
    expect(column.bookingLanes).toBe(1)
  })
})