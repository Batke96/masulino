import { describe, expect, it } from "vitest";
import { compareSort, matchesAnyColumn, matchesColumn, visitSortKey } from "./sort";

describe("compareSort", () => {
  it("sorts money by the amount, not by the written text", () => {
    const amounts = [900, 1200, 20000];
    const ascending = [...amounts].sort((left, right) => compareSort("number", left, right, "asc"));
    expect(ascending).toEqual([900, 1200, 20000]);
    expect(compareSort("text", "12,00 €", "9,00 €", "asc")).toBeLessThan(0);
  });

  it("sorts a visit by its age, not by the sentence", () => {
    expect(compareSort("number", visitSortKey("vor 74 Tagen"), visitSortKey("vor 3 Tagen"), "asc")).toBeLessThan(0);
    expect(compareSort("text", "vor 3 Tagen", "vor 74 Tagen", "asc")).toBeLessThan(0);
  });

  it("puts yes before no and keeps the request status order", () => {
    expect(compareSort("boolean", true, false, "asc")).toBeLessThan(0);
    expect(compareSort("status", "abgelehnt", "angefragt", "asc")).toBeGreaterThan(0);
    expect(compareSort("status", "bearbeitet", "angenommen", "asc")).toBeLessThan(0);
  });

  it("keeps empty values at the end in both directions", () => {
    expect(compareSort("text", "", "Anna", "asc")).toBeGreaterThan(0);
    expect(compareSort("text", "", "Anna", "desc")).toBeGreaterThan(0);
    expect(compareSort("number", null, 0, "desc")).toBeGreaterThan(0);
  });
});

describe("matchesColumn", () => {
  it("matches the visible text and ignores an empty query", () => {
    expect(matchesColumn("", "Anna Beispiel")).toBe(true);
    expect(matchesColumn("  beispiel ", "Anna Beispiel")).toBe(true);
    expect(matchesColumn("Michel", "Anna Beispiel")).toBe(false);
  });
});

describe("matchesAnyColumn", () => {
  it("matches the query in any column of the row", () => {
    const row = ["Geburtstag", "Fr., 13.11.", "14:30", "Anna Beispiel", "8 Kinder, 4 Erwachsene", "Tisch 8"];
    expect(matchesAnyColumn("", row)).toBe(true);
    expect(matchesAnyColumn("14:30", row)).toBe(true);
    expect(matchesAnyColumn("tisch 8", row)).toBe(true);
    expect(matchesAnyColumn("Michel", row)).toBe(false);
  });
});
