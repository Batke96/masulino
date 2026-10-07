import { describe, expect, it } from "vitest";
import { AppError } from "@masulino/contracts";
import { buildProposal } from "./plan";

const person = "person-a";

describe("weekly proposal", () => {
  it("stays a draft calculation and warns on coverage, overlap, and long shifts", () => {
    const result = buildProposal({
      weekStartsOn: "2026-09-28",
      windows: [
        { principalId: person, weekday: 1, startMinute: 9 * 60, endMinute: 17 * 60 },
        { principalId: person, weekday: 1, startMinute: 16 * 60, endMinute: 20 * 60 },
      ],
      leave: [],
      bookings: [{ localDate: "2026-09-28", childrenCount: 20 }],
    });
    expect(result.shifts).toHaveLength(2);
    expect(result.shifts.every((shift) => shift.breakMinutes === 0)).toBe(true);
    expect(result.warnings.map((warning) => warning.code).sort()).toEqual([
      "break",
      "coverage_gap",
      "overlap",
    ]);
    expect("status" in result).toBe(false);
  });

  it("skips a person who is on leave and does not warn when nobody is required", () => {
    const result = buildProposal({
      weekStartsOn: "2026-09-28",
      windows: [{ principalId: person, weekday: 1, startMinute: 600, endMinute: 720 }],
      leave: [{ principalId: person, startsOn: "2026-09-28", endsOn: "2026-09-28" }],
      bookings: [],
    });
    expect(result.shifts).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("treats touching shifts as separate and rejects a week that does not start on Monday", () => {
    const result = buildProposal({
      weekStartsOn: "2026-09-28",
      windows: [
        { principalId: person, weekday: 2, startMinute: 540, endMinute: 720 },
        { principalId: person, weekday: 2, startMinute: 720, endMinute: 900 },
      ],
      leave: [],
      bookings: [{ localDate: "2026-09-29", childrenCount: 8 }],
    });
    expect(result.warnings).toEqual([]);
    expect(result.shifts).toHaveLength(2);
    expect(() => buildProposal({ weekStartsOn: "2026-09-29", windows: [], leave: [], bookings: [] })).toThrow(
      AppError,
    );
  });
});
