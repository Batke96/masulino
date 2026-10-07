import { describe, expect, it } from "vitest";
import { localParts } from "./clock";

describe("venue local time", () => {
  it("keeps the Europe/Berlin calendar date across the daylight-saving transitions", () => {
    expect(localParts(new Date("2026-03-29T00:30:00.000Z"), "Europe/Berlin")).toEqual({
      localDate: "2026-03-29",
      localTime: "01:30",
    });
    expect(localParts(new Date("2026-03-29T01:30:00.000Z"), "Europe/Berlin")).toEqual({
      localDate: "2026-03-29",
      localTime: "03:30",
    });
    expect(localParts(new Date("2026-10-25T00:30:00.000Z"), "Europe/Berlin")).toEqual({
      localDate: "2026-10-25",
      localTime: "02:30",
    });
    expect(localParts(new Date("2026-10-25T01:30:00.000Z"), "Europe/Berlin")).toEqual({
      localDate: "2026-10-25",
      localTime: "02:30",
    });
  });
});
