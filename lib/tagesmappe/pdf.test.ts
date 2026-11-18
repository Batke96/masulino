import { describe, expect, it } from "vitest";
import { exampleTagesmappe } from "./folder";
import { renderTagesmappePdf } from "./pdf";

describe("Tagesmappe PDF", () => {
  const bytes = renderTagesmappePdf(exampleTagesmappe(), "18.11.2026, 18:05");
  const text = pdfText(bytes);

  it("is a four-page PDF of the example folder", () => {
    const latin = Buffer.from(bytes).toString("latin1");
    expect(latin.startsWith("%PDF-1.4")).toBe(true);
    expect(latin.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(latin).toContain("/Count 4");
    expect(text).toContain("Tagesmappe · Beispiel");
    expect(text).toContain("29.10.2026");
    expect(text).toContain("Seite 1 – Tagesübersicht");
    expect(text).toContain("Familie Müller");
    expect(text).toContain("B-1024");
    expect(text).toContain("14:30–19:00 · Tisch 7");
    expect(text).toContain("10 Kinder · 6 Erwachsene · Deluxe");
    expect(text).toContain("10 Essenscoupons vorgesehen · Auswahl vor Ort");
    expect(text).toContain("8 Kinder · 4 Erwachsene · Comfort");
    expect(text).toContain("12 Essenscoupons vorgesehen · Auswahl vor Ort");
    expect(text).toContain("Anpassungen");
    expect(text).toContain("Coupon-Ausgabe");
    expect(text).toContain("Abrechnung");
    expect(text).toContain("Seite 4 von 4");
    expect(text).toContain("Stand 18.11.2026, 18:05");
  });

  it("gives Comfort no meal-coupon line", () => {
    const coupons = text.match(/Essenscoupons?/g) ?? [];
    expect(coupons).toEqual(["Essenscoupons", "Essenscoupons"]);
  });
});

function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const parts: string[] = [];
  const pattern = /\((?:\\.|[^\\)])*\)/g;
  for (const match of raw.matchAll(pattern)) {
    parts.push(decodePdfLiteral(match[0].slice(1, -1)));
  }
  return parts.join("\n");
}

function decodePdfLiteral(body: string): string {
  let out = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char !== "\\") {
      out += char;
      continue;
    }
    const next = body[index + 1];
    if (next === "n" || next === "r" || next === "t") {
      out += next === "n" ? "\n" : next === "r" ? "\r" : "\t";
      index += 1;
      continue;
    }
    if (next === "(" || next === ")" || next === "\\") {
      out += next;
      index += 1;
      continue;
    }
    if (next && /[0-7]/.test(next)) {
      let octal = next;
      let cursor = index + 2;
      while (octal.length < 3 && cursor < body.length && /[0-7]/.test(body[cursor] ?? "")) {
        octal += body[cursor];
        cursor += 1;
      }
      out += winAnsiChar(parseInt(octal, 8));
      index += octal.length;
      continue;
    }
    out += next ?? "";
    index += 1;
  }
  return out;
}

function winAnsiChar(code: number): string {
  if (code === 0x96) return "\u2013";
  if (code === 0x97) return "\u2014";
  return String.fromCharCode(code);
}
