import { AppError } from "@masulino/contracts";
import { describe, expect, it } from "vitest";
import {
  applyReadyInvoices,
  loadReadyInvoices,
  shiftIsoDate,
  syncWindow,
  todayInTimeZone,
  type ReadyInvoice,
} from "./sync";

const invoice: ReadyInvoice = {
  invoice_id: 10,
  invoice_timestamp: "2026-11-12 14:05:00",
  invoice_numberFull: "RG2026/10",
  payment: [{ billPayment_name: "Bar" }],
  items: [{
    item_id: 77,
    item_name: "Kind ab 1 Jahr",
    item_quantity: 2,
    item_total: 24,
    item_totalNet: 20.17,
    item_vat: 3.83,
    item_vatRate: 19,
    item_product_pricePerUnit: 12,
    item_product_priceNetPerUnit: 10.08,
    item_lineDiscountGross: 1,
    item_invoiceDiscountGross: 0.5,
    item_lineDiscountNet: 0.84,
    item_invoiceDiscountNet: 0.42,
    productgroup_name: "Eintritt",
  }],
};

describe("ready2order till sync", () => {
  it("starts on the open ready2order day once the csv gap is covered", () => {
    expect(syncWindow({
      today: "2026-11-25",
      firstReady: "2026-11-12",
      lastReady: "2026-11-20",
      lastCsv: "2026-11-11",
    })).toEqual({
      from: "2026-11-20",
      to: "2026-11-25",
    });
  });

  it("goes back to the day after the csv when the first api day leaves a gap", () => {
    expect(syncWindow({
      today: "2026-11-25",
      firstReady: "2026-11-22",
      lastReady: "2026-11-25",
      lastCsv: "2026-11-11",
    })).toEqual({
      from: "2026-11-12",
      to: "2026-11-25",
    });
  });

  it("starts the day after the last csv day", () => {
    expect(syncWindow({ today: "2026-11-25", firstReady: null, lastReady: null, lastCsv: "2026-11-11" })).toEqual({
      from: "2026-11-12",
      to: "2026-11-25",
    });
    expect(shiftIsoDate("2026-11-30", 1)).toBe("2026-12-01");
  });

  it("starts on 12 November when the till is empty", () => {
    expect(syncWindow({ today: "2026-11-25", firstReady: null, lastReady: null, lastCsv: null })).toEqual({
      from: "2026-11-12",
      to: "2026-11-25",
    });
  });

  it("does not ask for a day after today", () => {
    expect(syncWindow({ today: "2026-11-10", firstReady: null, lastReady: null, lastCsv: "2026-11-11" }).from).toBe("2026-11-10");
  });

  it("keeps a known article category and skips training and cancelled bills", () => {
    const applied = applyReadyInvoices([
      invoice,
      { ...invoice, invoice_id: 11, invoice_testMode: true },
      { ...invoice, invoice_id: 12, invoice_deleted_at: "2026-11-12 15:00:00", invoice_testMode: false },
    ], new Map([["Kind ab 1 Jahr", "Eintritt Kind"]]));
    expect(applied.dropInvoiceIds).toEqual(["12"]);
    expect(applied.categories).toEqual([]);
    expect(applied.lines).toHaveLength(1);
    expect(applied.lines[0]).toMatchObject({
      importKey: "ready2order:10:77",
      invoiceNumber: "RG2026/10",
      paymentMethod: "Bar",
      category: "Eintritt Kind",
      productGroup: "Eintritt",
      quantity: "2",
      lineGross: "24",
      discountGross: "1.5",
      discountNet: "1.26",
      businessDate: "2026-11-12",
      bookedAt: "14:05:00",
      siteName: "Äppelallee (Biebrich)",
    });
  });

  it("classifies a new article without replacing a later known name", () => {
    const applied = applyReadyInvoices([invoice], new Map());
    expect(applied.categories).toEqual([
      expect.objectContaining({
        productName: "Kind ab 1 Jahr",
        category: "Eintritt",
        groupKey: "sonstiges",
      }),
    ]);
    expect(applied.lines[0]?.category).toBe("Eintritt");
  });

  it("reads every invoice page and stops at the count", async () => {
    const seen: URL[] = [];
    const fetchImpl = (async (url: URL) => {
      seen.push(url);
      const offset = Number(url.searchParams.get("offset"));
      const body = offset === 0
        ? { invoices: [invoice], count: 2 }
        : { invoices: [{ ...invoice, invoice_id: 11 }], count: 2 };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const loaded = await loadReadyInvoices({
      token: "secret",
      from: "2026-11-12",
      to: "2026-11-25",
      fetchImpl,
    });
    expect(seen.map((url) => url.searchParams.get("offset"))).toEqual(["0", "1"]);
    expect(seen[0]?.searchParams.get("dateField")).toBe("daily_report");
    expect(seen[0]?.searchParams.get("items")).toBe("true");
    expect(seen[0]?.searchParams.get("testMode")).toBe("false");
    expect(loaded.map((item) => item.invoice_id)).toEqual([10, 11]);
  });

  it("reads the next page when count only describes the full page", async () => {
    const seen: URL[] = [];
    const fetchImpl = (async (url: URL) => {
      seen.push(url);
      const offset = Number(url.searchParams.get("offset"));
      const body = offset === 0
        ? { invoices: [invoice, { ...invoice, invoice_id: 11 }], count: 2, limit: 2 }
        : { invoices: [{ ...invoice, invoice_id: 12 }], count: 1, limit: 2 };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const loaded = await loadReadyInvoices({
      token: "secret",
      from: "2026-11-12",
      to: "2026-11-25",
      fetchImpl,
    });
    expect(seen.map((url) => url.searchParams.get("offset"))).toEqual(["0", "2"]);
    expect(seen[0]?.searchParams.get("limit")).toBe("100");
    expect(loaded.map((item) => item.invoice_id)).toEqual([10, 11, 12]);
  });

  it("stops when ready2order limits the calls", async () => {
    const fetchImpl = (async () => new Response("slow", { status: 429 })) as typeof fetch;
    await expect(loadReadyInvoices({
      token: "secret",
      from: "2026-11-12",
      to: "2026-11-25",
      fetchImpl,
    })).rejects.toMatchObject({ code: "rate_limited" } satisfies Partial<AppError>);
  });

  it("rejects a page that is not json", async () => {
    const fetchImpl = (async () => new Response("<html>", { status: 403 })) as typeof fetch;
    await expect(loadReadyInvoices({
      token: "secret",
      from: "2026-11-12",
      to: "2026-11-25",
      fetchImpl,
    })).rejects.toMatchObject({ code: "validation" });
  });

  it("names today in Berlin", () => {
    expect(todayInTimeZone("Europe/Berlin", new Date("2026-11-25T23:30:00.000Z"))).toBe("2026-11-26");
  });
});
