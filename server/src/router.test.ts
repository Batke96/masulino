import { describe, expect, it } from "vitest";
import { handleApiRequest } from "./api-entry";

describe("api entry", () => {
  it("answers health without opening the database", async () => {
    const response = await handleApiRequest(new Request("http://staff.test/api/health"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, service: "masulino-api" });
  });

  it("leaves unknown paths as not found", async () => {
    const response = await handleApiRequest(new Request("http://staff.test/api/missing"));
    expect(response.status).toBe(404);
  });

  it("accepts a website honeypot with the marker the site looks for", async () => {
    const response = await handleApiRequest(
      new Request("http://staff.test/api/buchungen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ buchung: "geburtstag", website: "bot" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"ok":true');
  });

  it("refuses a birthday request whose window is not offered that day", async () => {
    const response = await handleApiRequest(
      new Request("http://staff.test/api/buchungen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          buchung: "geburtstag",
          datum: "2026-11-24",
          zeitfenster: "10:00\u201313:30 Uhr",
          paket: "comfort",
          kind_name: "Lea",
          kind_alter: "7",
          kinder: 8,
          kleinkinder: 0,
          erwachsene: 2,
          erwachsenenZusatz: false,
          summeVorschau: 1000,
          vorname: "Anna",
          nachname: "Beispiel",
          anrede: "Frau",
          adresse: "Äppelallee 1",
          plz: "65203",
          email: "anna@example.com",
          telefon: "015100000000",
          nachricht: "",
          quelle: "",
          datenschutz: "on",
          website: "",
        }),
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.text();
    expect(body).toContain('"ok":false');
    expect(body).not.toContain('"ok":true');
  });

});
