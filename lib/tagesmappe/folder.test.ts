import { describe, expect, it } from "vitest";
import {
  buildTagesmappe,
  exampleTagesmappe,
  folderBookingFromView,
  folderFileName,
  folderFootnote,
  folderMeta,
  type FolderBooking,
  type PartyPage,
} from "./folder";

function party(pages: ReturnType<typeof exampleTagesmappe>["pages"], name: string): PartyPage {
  const found = pages.find((page) => page.kind === "party" && page.title.endsWith(name));
  if (!found || found.kind !== "party") throw new Error(`missing ${name}`);
  return found;
}

describe("example Tagesmappe", () => {
  const folder = exampleTagesmappe();

  it("matches the mock for 29.10.2026", () => {
    expect(folder.dateIso).toBe("2026-10-29");
    expect(folder.dateLabel).toBe("29.10.2026");
    expect(folderMeta(folder)).toBe("4 Seiten · aktuelle Beispielbuchungen");
    expect(folderFileName(folder)).toBe("Tagesmappe-2026-10-29.pdf");
    expect(folder.pages.map((page) => page.title)).toEqual([
      "Seite 1 – Tagesübersicht",
      "Seite 2 – Familie Müller",
      "Seite 3 – Familie Schmidt",
      "Seite 4 – Familie Weber",
    ]);
  });

  it("lists the three parties on the overview", () => {
    const overview = folder.pages[0];
    expect(overview?.kind).toBe("overview");
    if (overview?.kind !== "overview") return;
    expect(overview.rows).toEqual([
      { time: "14:30", name: "Familie Müller", counts: "10 K · 6 E" },
      { time: "14:30", name: "Familie Schmidt", counts: "8 K · 4 E" },
      { time: "14:30", name: "Familie Weber", counts: "12 K · 5 E" },
    ]);
  });

  it("prints the birthday window, the table and Deluxe coupons", () => {
    const mueller = party(folder.pages, "Familie Müller");
    expect(mueller.reference).toBe("B-1024");
    expect(mueller.when).toBe("14:30–19:00 · Tisch 7");
    expect(mueller.party).toBe("10 Kinder · 6 Erwachsene · Deluxe");
    expect(mueller.coupons).toBe("10 Essenscoupons vorgesehen · Auswahl vor Ort");

    const schmidt = party(folder.pages, "Familie Schmidt");
    expect(schmidt.reference).toBe("B-1025");
    expect(schmidt.when).toBe("14:30–19:00 · Tisch 3");
    expect(schmidt.party).toBe("8 Kinder · 4 Erwachsene · Comfort");
    expect(schmidt.coupons).toBeNull();

    const weber = party(folder.pages, "Familie Weber");
    expect(weber.coupons).toBe("12 Essenscoupons vorgesehen · Auswahl vor Ort");
    expect(weber.note).toContain("Coupon-Ausgabe");
  });
});

describe("buildTagesmappe", () => {
  const base: FolderBooking = {
    id: "1",
    reference: "MS-1",
    name: "Kita Sonnenschein",
    time: "09:30",
    children: 18,
    adults: 3,
    packageName: "Gruppenbesuch",
    tables: ["Hof"],
    kind: "group",
    status: "confirmed",
  };

  it("drops cancelled bookings and sorts by time", () => {
    const folder = buildTagesmappe({
      dateIso: "2026-11-11",
      source: "live",
      bookings: [
        { ...base, id: "late", name: "Spät", time: "11:00" },
        { ...base, id: "gone", name: "Weg", status: "cancelled" },
        { ...base, id: "early", name: "Früh", time: "09:00" },
      ],
    });
    expect(folderMeta(folder)).toBe("3 Seiten · aktuelle Buchungen");
    expect(folderFootnote("live")).toContain("Buchungen dieses Tages");
    const overview = folder.pages[0];
    if (overview?.kind !== "overview") throw new Error("overview");
    expect(overview.rows.map((row) => row.name)).toEqual(["Früh", "Spät"]);
    const first = folder.pages[1];
    if (first?.kind !== "party") throw new Error("party");
    expect(first.when).toBe("09:00–13:00 · Hof");
    expect(first.coupons).toBeNull();
  });

  it("uses the weekend birthday window that contains the start", () => {
    const folder = buildTagesmappe({
      dateIso: "2026-11-14",
      source: "live",
      bookings: [{ ...base, kind: "birthday", packageName: "Geburtstag Deluxe", time: "15:30", children: 1, adults: 1, tables: [] }],
    });
    const sheet = folder.pages[1];
    if (sheet?.kind !== "party") throw new Error("party");
    expect(sheet.when).toBe("15:30–19:00 · ohne Tisch");
    expect(sheet.party).toBe("1 Kind · 1 Erwachsener · Deluxe");
    expect(sheet.coupons).toBe("1 Essenscoupon vorgesehen · Auswahl vor Ort");
  });

  it("keeps an empty day as one overview page", () => {
    const folder = buildTagesmappe({ dateIso: "2026-11-11", source: "live", bookings: [] });
    expect(folder.pages).toHaveLength(1);
    expect(folder.pages[0]?.kind).toBe("overview");
    if (folder.pages[0]?.kind === "overview") {
      expect(folder.pages[0].emptyLabel).toBe("Für diesen Tag gibt es keine Buchung.");
    }
  });

  it("reads a booking view into a folder booking", () => {
    const booking = folderBookingFromView({
      id: "abc",
      reference: " MS-9 ",
      name: " Familie Keller ",
      time: "14:30",
      type: "Geburtstag",
      packageName: "Geburtstag Comfort",
      childrenCount: 8,
      adultCount: 4,
      tables: ["Tisch 3"],
      status: "confirmed",
    });
    expect(booking.kind).toBe("birthday");
    expect(booking.reference).toBe("MS-9");
    expect(booking.name).toBe("Familie Keller");
    expect(booking.adults).toBe(4);
  });
});
