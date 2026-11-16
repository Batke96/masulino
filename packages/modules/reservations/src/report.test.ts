import { describe, expect, it } from "vitest";
import { isBirthdayPackage, promisedBookingMinor } from "./report";

describe("birthday package", () => {
  it("recognises a birthday package by its name", () => {
    expect(isBirthdayPackage("Geburtstag Deluxe")).toBe(true);
    expect(isBirthdayPackage("geburtstagsfeier")).toBe(true);
    expect(isBirthdayPackage("Spielfläche")).toBe(false);
  });
});

describe("promised booking amount", () => {
  it("multiplies the per-child price and adds the adult flat rate", () => {
    expect(promisedBookingMinor(1480, 8, 1000)).toBe(8 * 1480 + 1000);
    expect(promisedBookingMinor(2180, 1, 0)).toBe(2180);
  });
});
