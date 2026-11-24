import { describe, expect, it } from "vitest";
import { periodDates, periodDatesUnion } from "./period";
import { isPublicHoliday, startsWithin, windowsFor } from "./slots";
import { placeBookings, tableIndex, tableOccupancyHeatmap, tableSeats } from "./tables";

const wednesday = "2026-11-11";

describe("booking periods", () => {
  it("builds today, tomorrow and three days from the anchor", () => {
    expect(periodDates(wednesday, "today")).toEqual(["2026-11-11"]);
    expect(periodDates(wednesday, "tomorrow")).toEqual(["2026-11-12"]);
    expect(periodDates(wednesday, "threeDays")).toEqual(["2026-11-11", "2026-11-12", "2026-11-13"]);
  });

  it("uses Monday to Sunday, including when the anchor is Sunday", () => {
    expect(periodDates(wednesday, "thisWeek")).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
    expect(periodDates("2026-11-15", "thisWeek")[0]).toBe("2026-11-09");
    expect(periodDates(wednesday, "nextWeek")[0]).toBe("2026-11-16");
    expect(periodDates(wednesday, "nextWeek")[6]).toBe("2026-11-22");
    expect(periodDatesUnion(wednesday, ["today", "tomorrow"])).toEqual(["2026-11-11", "2026-11-12"]);
  });
});

describe("venue windows", () => {
  it("uses the regular weekday windows", () => {
    expect(windowsFor(wednesday, "birthday")).toEqual([{ start: "14:30", end: "19:00" }]);
    expect(windowsFor(wednesday, "group")).toEqual([{ start: "09:00", end: "13:00" }]);
  });

  it("opens the long birthday window on a Hessian school day in the holidays", () => {
    expect(windowsFor("2026-10-07", "birthday")).toEqual([{ start: "12:00", end: "19:00" }]);
    expect(windowsFor("2026-10-07", "group")).toEqual([{ start: "09:00", end: "13:00" }]);
  });

  it("uses the weekend birthday windows and no group window", () => {
    expect(windowsFor("2026-11-14", "birthday")).toEqual([
      { start: "10:00", end: "13:30" },
      { start: "11:00", end: "14:30" },
      { start: "15:30", end: "19:00" },
    ]);
    expect(windowsFor("2026-11-14", "group")).toEqual([]);
  });

  it("keeps Christmas Eve and New Year ahead of the holiday calendar", () => {
    expect(windowsFor("2026-12-24", "birthday")).toEqual([{ start: "12:00", end: "17:00" }]);
    expect(windowsFor("2026-12-24", "group")).toEqual([{ start: "09:00", end: "13:00" }]);
    expect(isPublicHoliday("2027-01-01")).toBe(true);
    expect(windowsFor("2027-01-01", "birthday")).toEqual([{ start: "12:00", end: "19:00" }]);
    expect(windowsFor("2027-01-01", "group")).toEqual([{ start: "09:00", end: "13:00" }]);
  });

  it("treats a weekday public holiday like the weekend for birthdays", () => {
    expect(isPublicHoliday("2026-12-25")).toBe(true);
    expect(windowsFor("2026-12-25", "birthday")).toHaveLength(3);
    expect(windowsFor("2026-12-25", "group")).toEqual([{ start: "09:00", end: "13:00" }]);
    expect(isPublicHoliday(wednesday)).toBe(false);
  });

  it("uses the vacation window on a movable school-free day and the regular window outside the published holidays", () => {
    expect(windowsFor("2027-02-08", "birthday")).toEqual([{ start: "12:00", end: "19:00" }]);
    expect(windowsFor("2026-07-06", "birthday")).toEqual([{ start: "14:30", end: "19:00" }]);
  });

  it("counts a start inside a window, including the overlapping morning slots", () => {
    const morning = windowsFor("2026-11-14", "birthday");
    expect(startsWithin("10:00", morning[0]!)).toBe(true);
    expect(startsWithin("10:00", morning[1]!)).toBe(false);
    expect(startsWithin("11:00", morning[0]!)).toBe(true);
    expect(startsWithin("11:00", morning[1]!)).toBe(true);
    expect(startsWithin("19:00", { start: "14:30", end: "19:00" })).toBe(false);
  });
});

describe("table names", () => {
  it("reads T1 to T16 and leaves other names unmatched", () => {
    expect(tableIndex("T5")).toBe(5);
    expect(tableIndex("Tisch 12")).toBe(12);
    expect(tableIndex("tisch12")).toBe(12);
    expect(tableIndex("Dschungelraum")).toBeNull();
    expect(tableIndex("Tisch 17")).toBeNull();
  });

  it("places a booking only on the selected kind and window", () => {
    const bookings = [
      { id: "a", name: "Weber", time: "14:30", type: "Geburtstag", status: "confirmed", tables: ["T5"] },
      { id: "b", name: "Sonnenschein", time: "10:00", type: "Gruppe", status: "requested", tables: ["Tisch 2", "Hof"] },
    ];
    const birthdays = placeBookings(bookings, "birthday", { start: "14:30", end: "19:00" });
    expect(birthdays.byTable.get(5)?.map((row) => row.name)).toEqual(["Weber"]);
    expect(birthdays.unmatched).toEqual([]);
    const groups = placeBookings(bookings, "group", { start: "09:00", end: "13:00" });
    expect(groups.byTable.get(2)?.map((row) => row.name)).toEqual(["Sonnenschein"]);
    expect(groups.unmatched.map((row) => row.name)).toEqual(["Sonnenschein"]);
  });
});

describe("table occupancy", () => {
  const dates = ["2026-11-11", "2026-11-12"];

  it("puts each booking on its day and divides by the seats", () => {
    const heatmap = tableOccupancyHeatmap(dates, [
      { date: "2026-11-11", time: "14:30", type: "Geburtstag", tables: ["Tisch 8"], children: 8, adults: 4 },
      { date: "2026-11-11", time: "10:00", type: "Gruppe", tables: ["Tisch 1"], children: 6, adults: 0 },
      { date: "2026-11-12", time: "14:30", type: "Geburtstag", tables: ["Tisch 8"], children: 4, adults: 0 },
      { date: "2026-11-11", time: "14:30", type: "Geburtstag", tables: ["Hof"], children: 4, adults: 1 },
    ]);
    const tisch8 = heatmap.rows.find((row) => row.label === "Tisch 8");
    const tisch1 = heatmap.rows.find((row) => row.label === "Tisch 1");
    expect(heatmap.columns).toEqual(["Mi 11.", "Do 12."]);
    expect(tisch8?.people).toEqual([12, 4]);
    expect(tisch8?.values[0]).toBeCloseTo(12 / 9);
    expect(tisch1?.people).toEqual([6, 0]);
    expect(tisch1?.values[0]).toBe(1);
    const seats = tableSeats.reduce((sum, seat) => sum + seat.seats, 0);
    expect(heatmap.house.seats).toBe(seats);
    expect(heatmap.house.people).toEqual([18, 4]);
    expect(heatmap.house.values[0]).toBeCloseTo(18 / seats);
  });

  it("counts a party once in the house row when it sits on two tables", () => {
    const heatmap = tableOccupancyHeatmap(dates, [
      { date: "2026-11-11", time: "14:30", type: "Geburtstag", tables: ["Tisch 8", "Tisch 3"], children: 8, adults: 2 },
    ]);
    expect(heatmap.rows.find((row) => row.label === "Tisch 8")?.people[0]).toBe(10);
    expect(heatmap.rows.find((row) => row.label === "Tisch 3")?.people[0]).toBe(10);
    expect(heatmap.house.people[0]).toBe(10);
    expect(heatmap.house.people[1]).toBe(0);
  });
});
