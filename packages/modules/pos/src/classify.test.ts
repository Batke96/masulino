import { describe, expect, it } from "vitest";
import { classifyProduct } from "./classify";

describe("classifyProduct", () => {
  it("counts paying children and leaves free babies out of quantity", () => {
    expect(classifyProduct("Eintritt Kind", "Kind ab 1 Jahr").role).toBe("paying_child");
    expect(classifyProduct("Eintritt Happy Hour", "Happy Hour Kind 1 Jahr").role).toBe("paying_child");
    expect(classifyProduct("Eintritt Kind", "Kind 0 Jahr")).toMatchObject({
      role: "free_baby",
      countInQuantity: false,
    });
    expect(classifyProduct("Eintritt Baby (frei)", "Baby unter 1 Jahr").role).toBe("free_baby");
  });

  it("keeps pagers out of food quantity and revenue", () => {
    expect(classifyProduct("Gastro Speisen", "Pager (1)")).toMatchObject({
      role: "ignore",
      groupKey: "gastro",
      countInQuantity: false,
      countInRevenue: false,
    });
  });

  it("maps the report groups", () => {
    expect(classifyProduct("Gastro Getränke", "Softdrink").groupKey).toBe("gastro");
    expect(classifyProduct("Geburtstag", "Deluxe Paket").groupKey).toBe("geburtstag");
    expect(classifyProduct("Chips/Extra", "Extra.").role).toBe("chip");
    expect(classifyProduct("Eintritt Erwachsene", "Erwachsener").role).toBe("adult");
    expect(classifyProduct("Gruppen (Kita/Schule)", "Gruppentarif ab 25 Kinder").role).toBe("group");
  });
});
