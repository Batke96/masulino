import { describe, expect, it } from "vitest";
import { parseWebsiteBooking } from "./website-bookings";

const birthday = {
  buchung: "geburtstag",
  datum: "2026-11-07",
  zeitfenster: "14:30\u201319:00 Uhr",
  paket: "deluxe",
  kind_name: "Lea",
  kind_alter: "7",
  kinder: 8,
  kleinkinder: 0,
  erwachsene: 4,
  erwachsenenZusatz: true,
  summeVorschau: 21760,
  vorname: "Anna",
  nachname: "Beispiel",
  email: "anna@example.com",
  telefon: "015100000000",
  nachricht: "",
  quelle: "Google / Google Maps",
  datenschutz: "on",
  website: "",
};

const kita = {
  buchung: "kita",
  wunschtermin: "2026-11-12",
  zeitfenster: "09:00\u201313:00 Uhr",
  kinder: 20,
  paedagogen: 2,
  begleitpersonen: 0,
  summeVorschau: 19800,
  einrichtung: "Kita Sonnenschein",
  art: "Kita",
  ansprechpartner: "Mia Beispiel",
  email: "kita@example.com",
  telefon: "061100000",
  nachricht: "",
  quelle: "",
  datenschutz: "on",
  website: "",
};

describe("website booking intake", () => {
  it("accepts the birthday and kita examples", () => {
    expect(parseWebsiteBooking(birthday, "2026-11-07")).toMatchObject({ ok: true, kind: "booking" });
    expect(parseWebsiteBooking(kita, "2026-11-07")).toMatchObject({ ok: true, kind: "booking" });
  });

  it("rejects a past date, a Saturday kita visit, a hyphen, and other booking kinds", () => {
    expect(parseWebsiteBooking(birthday, "2026-11-08").ok).toBe(false);
    expect(parseWebsiteBooking({ ...kita, wunschtermin: "2026-11-14" }, "2026-11-07").ok).toBe(false);
    expect(parseWebsiteBooking({ ...birthday, zeitfenster: "14:30-19:00 Uhr" }, "2026-11-07").ok).toBe(false);
    expect(parseWebsiteBooking({ ...birthday, buchung: "bewerbung" }, "2026-11-07").ok).toBe(false);
  });

  it("rejects an adult extra outside deluxe and a non-empty honeypot without treating it as invalid", () => {
    expect(parseWebsiteBooking({ ...birthday, paket: "comfort", erwachsenenZusatz: true }, "2026-11-07").ok).toBe(false);
    expect(parseWebsiteBooking({ ...birthday, erwachsene: 0, erwachsenenZusatz: true }, "2026-11-07").ok).toBe(false);
    expect(parseWebsiteBooking({ ...birthday, website: "https://spam.example" }, "2026-11-07")).toEqual({
      ok: true,
      kind: "honeypot",
    });
    expect(parseWebsiteBooking({ buchung: "bewerbung", website: "bot" }, "2026-11-07")).toEqual({
      ok: true,
      kind: "honeypot",
    });
  });

  it("rejects the wrong types and a missing honeypot field", () => {
    const { website: _website, ...withoutWebsite } = birthday;
    expect(parseWebsiteBooking(withoutWebsite, "2026-11-07").ok).toBe(false);
    expect(parseWebsiteBooking({ ...birthday, kinder: "8" }, "2026-11-07").ok).toBe(false);
    expect(parseWebsiteBooking({ ...birthday, kind_alter: 7 }, "2026-11-07").ok).toBe(false);
    expect(parseWebsiteBooking({ ...birthday, summeVorschau: 21760.5 }, "2026-11-07").ok).toBe(false);
    expect(parseWebsiteBooking({ ...birthday, extra: true }, "2026-11-07").ok).toBe(false);
  });
});
