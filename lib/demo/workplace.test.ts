import { describe, expect, it } from "vitest";
import { fixturePackage, homeTableSeat, shiftClock, workplaceFixtures } from "./workplace";

describe("workplace fixtures", () => {
  it("matches the local Übersicht rows", () => {
    expect(workplaceFixtures.map((row) => row.name)).toEqual(["Familie Beispiel", "Familie Anfrage"]);
    expect(homeTableSeat().id).toBe(8);
    expect(fixturePackage.priceMinor).toBe(25000);
    expect(shiftClock("14:00", -30)).toBe("13:30");
    expect(shiftClock("16:00", 30)).toBe("16:30");
  });
});
