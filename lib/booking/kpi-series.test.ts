import { describe, expect, it } from "vitest";
import { deltaAgainstPrevious, historyCaption, historyDates, seriesForDates } from "./kpi-series";

describe("overview kpi history", () => {
  it("ends on the anchor and leaves missing days at zero", () => {
    const dates = historyDates("2026-11-11");
    expect(dates).toEqual([
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
    ]);
    const series = seriesForDates(dates, [
      { date: "2026-11-11", type: "Geburtstag" },
      { date: "2026-11-11", type: "Gruppe" },
      { date: "2026-11-11", type: "Geburtstag" },
    ], false);
    expect(series).toEqual([0, 0, 0, 0, 0, 0, 3]);
    expect(seriesForDates(dates, [{ date: "2026-11-11", type: "Geburtstag" }, { date: "2026-11-11", type: "Gruppe" }], true)).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });

  it("skips a percentage when yesterday has no booking", () => {
    expect(deltaAgainstPrevious([0, 0, 3])).toBeUndefined();
    expect(deltaAgainstPrevious([0, 0, 0])).toBe(0);
    expect(deltaAgainstPrevious([2, 3])).toBeCloseTo(0.5);
    expect(historyCaption([0, 3], "booking")).toBe("Letzte 7 Tage · gestern ohne Buchung.");
    expect(historyCaption([1, 1], "birthday")).toBe("Gegen gestern");
  });
});
