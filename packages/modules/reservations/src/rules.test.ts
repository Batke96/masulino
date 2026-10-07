import { describe, expect, it } from "vitest";
import { AppError } from "@masulino/contracts";
import { parseVenueLocal } from "./time";
import { assertCanUsePublishedRule, type PublishedRule } from "./rules";

const opening = {
  mon: { startMinute: 600, endMinute: 1080 },
  tue: { startMinute: 600, endMinute: 1080 },
  wed: { startMinute: 600, endMinute: 1080 },
  thu: { startMinute: 600, endMinute: 1080 },
  fri: { startMinute: 600, endMinute: 1080 },
  sat: { startMinute: 600, endMinute: 1080 },
  sun: null,
};

function rule(overrides: Partial<PublishedRule> = {}): PublishedRule {
  return {
    timezone: "Europe/Berlin",
    openingHours: opening,
    bufferBeforeMinutes: 30,
    bufferAfterMinutes: 30,
    slotMinutes: 30,
    combinationCount: 2,
    adultSeating: "not_required",
    cancellationPolicy: null,
    businessDecisionsConfirmed: false,
    fixture: true,
    ...overrides,
  };
}

describe("venue time", () => {
  it("keeps a Berlin afternoon instant in UTC", () => {
    const dt = parseVenueLocal("2026-06-15", "14:30", "Europe/Berlin");
    expect(dt.toUTC().toISO()).toBe("2026-06-15T12:30:00.000Z");
  });

  it("rejects the spring-forward gap and the ambiguous fall-back hour", () => {
    expect(() => parseVenueLocal("2026-03-29", "02:30", "Europe/Berlin")).toThrow(AppError);
    expect(() => parseVenueLocal("2026-10-25", "02:30", "Europe/Berlin")).toThrow(AppError);
  });
});

describe("published rules", () => {
  it("allows fixture rules outside production and rejects them in production", () => {
    expect(() => assertCanUsePublishedRule(rule(), "test")).not.toThrow();
    expect(() => assertCanUsePublishedRule(rule(), "production")).toThrow(AppError);
  });

  it("rejects unconfigured adult seating before any environment", () => {
    expect(() => assertCanUsePublishedRule(rule({ adultSeating: "unconfigured" }), "test")).toThrow(
      AppError,
    );
  });
});
