import { describe, expect, it } from "vitest";
import { shownBookings } from "./shown-bookings";

const fixtures = [
  { id: "M-2401", type: "Gruppe" },
  { id: "M-2402", type: "Geburtstag" },
  { id: "M-2403", type: "Geburtstag" },
  { id: "M-2404", type: "Geburtstag" },
];

describe("shown bookings", () => {
  it("keeps the four sample rows only in the fixture walkthrough", () => {
    const shown = shownBookings({ liveMode: false, live: null, fixtures });
    expect(shown.loading).toBe(false);
    expect(shown.rows).toHaveLength(4);
    expect(shown.rows.filter((row) => row.type === "Geburtstag")).toHaveLength(3);
  });

  it("does not show the sample 4 and 3 while the signed-in list is still loading", () => {
    const shown = shownBookings({ liveMode: true, live: null, fixtures });
    expect(shown.loading).toBe(true);
    expect(shown.rows).toEqual([]);
  });

  it("keeps a successful empty live list at zero", () => {
    const shown = shownBookings({ liveMode: true, live: [], fixtures });
    expect(shown.loading).toBe(false);
    expect(shown.rows).toEqual([]);
  });

  it("drops cancelled and hidden live rows", () => {
    const live: Array<{ id: string; status?: string }> = [
      { id: "a", status: "confirmed" },
      { id: "b", status: "cancelled" },
      { id: "c", status: "confirmed" },
    ];
    const shown = shownBookings({
      liveMode: true,
      live,
      fixtures: live,
      hiddenIds: ["c"],
    });
    expect(shown.rows.map((row) => row.id)).toEqual(["a"]);
  });
});
