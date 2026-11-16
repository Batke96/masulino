import { describe, expect, it } from "vitest";
import { daysInMonth, fractionalChange, shiftMonth, weekdayTargets } from "./targets";

describe("pos period helpers", () => {
  it("shifts months across the year boundary", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
  });

  it("lists every day of a month", () => {
    expect(daysInMonth("2026-02")).toHaveLength(28);
    expect(daysInMonth("2026-11")[0]).toBe("2026-11-01");
    expect(daysInMonth("2026-11").at(-1)).toBe("2026-11-30");
  });

  it("averages a weekday from history", () => {
    const targets = weekdayTargets([
      { date: "2025-10-04", gross: 100, quantity: 10 },
      { date: "2025-10-11", gross: 300, quantity: 30 },
    ]);
    expect(targets.get(6)).toEqual({ gross: 200, quantity: 20 });
  });

  it("leaves a delta empty when the previous period is zero", () => {
    expect(fractionalChange(10, 0)).toBeNull();
    expect(fractionalChange(110, 100)).toBeCloseTo(0.1);
  });
});
