import { describe, expect, it } from "vitest";
import { classifyGuestPatch, guestMayMoveReservation } from "./guest-policy";
import { reminderAt } from "./time";

describe("guest change policy", () => {
  it("allows only phone and notes until edit rules are confirmed", () => {
    expect(classifyGuestPatch({ expectedVersion: 1, organizerPhone: "0301", notes: "Fenster" })).toBe("apply");
    expect(classifyGuestPatch({ expectedVersion: 1, localTime: "10:00", notes: "Fenster" })).toBe("staff");
    expect(classifyGuestPatch({ expectedVersion: 1, organizerEmail: "other@example.test" })).toBe("staff");
    expect(classifyGuestPatch({ expectedVersion: 1, childrenCount: 4 })).toBe("staff");
    expect(guestMayMoveReservation()).toBe(false);
  });
});

describe("reminder schedule", () => {
  it("uses 09:00 on the previous local day in the venue timezone", () => {
    const reminder = reminderAt("2026-06-15", "Europe/Berlin");
    expect(reminder.toISOString()).toBe("2026-06-14T07:00:00.000Z");
  });

  it("keeps 09:00 local through the autumn offset change", () => {
    const reminder = reminderAt("2026-10-26", "Europe/Berlin");
    expect(reminder.toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });
});
