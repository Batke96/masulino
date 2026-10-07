import { describe, expect, it } from "vitest";
import { allocate } from "./allocate";
import type { AllocationInput } from "@masulino/contracts";

const start = new Date("2026-06-01T08:00:00.000Z");
const end = new Date("2026-06-01T11:00:00.000Z");

function input(overrides: Partial<AllocationInput> = {}): AllocationInput {
  return {
    children: 8,
    adults: 4,
    adultSeating: "not_required",
    startMinute: 10 * 60,
    endMinute: 12 * 60,
    opening: { startMinute: 10 * 60, endMinute: 18 * 60 },
    closed: false,
    occupancyStart: start,
    occupancyEnd: end,
    resources: [
      { id: "t1", name: "Tisch 1", capacityChildren: 8, capacityAdults: 0, active: true },
      { id: "t2", name: "Tisch 2", capacityChildren: 8, capacityAdults: 0, active: true },
      { id: "t3", name: "Tisch 3", capacityChildren: 10, capacityAdults: 6, active: true },
    ],
    combinations: [
      {
        id: "c1",
        name: "Tisch 1",
        minChildren: 1,
        maxChildren: 8,
        minAdults: 0,
        maxAdults: 20,
        resourceIds: ["t1"],
      },
      {
        id: "c3",
        name: "Tisch 3",
        minChildren: 1,
        maxChildren: 10,
        minAdults: 0,
        maxAdults: 20,
        resourceIds: ["t3"],
      },
      {
        id: "c12",
        name: "Tisch 1+2",
        minChildren: 9,
        maxChildren: 16,
        minAdults: 0,
        maxAdults: 30,
        resourceIds: ["t1", "t2"],
      },
    ],
    occupancy: [],
    ...overrides,
  };
}

describe("allocate", () => {
  it("picks the tightest feasible combination deterministically", () => {
    const result = allocate(input({ children: 8 }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.choice.combinationId).toBe("c1");
  });

  it("uses a larger combination when the party exceeds a single table", () => {
    const result = allocate(input({ children: 12 }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.choice.combinationId).toBe("c12");
      expect(result.choice.resourceIds).toEqual(["t1", "t2"]);
    }
  });

  it("rejects overlap on any table in the combination", () => {
    const result = allocate(
      input({
        children: 12,
        occupancy: [{ resourceId: "t2", start, end }],
      }),
    );
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("treats intervals as half-open", () => {
    const result = allocate(
      input({
        occupancy: [
          {
            resourceId: "t1",
            start: new Date("2026-06-01T06:00:00.000Z"),
            end: start,
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects closures and times outside opening hours", () => {
    expect(allocate(input({ closed: true })).ok).toBe(false);
    expect(allocate(input({ startMinute: 9 * 60 })).ok).toBe(false);
  });

  it("requires adult capacity only when adult seating is required", () => {
    const without = allocate(input({ adultSeating: "not_required", adults: 10, children: 8 }));
    expect(without.ok).toBe(true);
    const withSeating = allocate(
      input({
        adultSeating: "required",
        adults: 4,
        children: 8,
      }),
    );
    expect(withSeating.ok).toBe(true);
    if (withSeating.ok) expect(withSeating.choice.combinationId).toBe("c3");
  });
});
