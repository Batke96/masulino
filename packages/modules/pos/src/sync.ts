import { AppError } from "@masulino/contracts";
import { requirePermission, type ActorContext } from "@masulino/core";
import { rows, withTenant } from "@masulino/database";
import { sql } from "drizzle-orm";
import { classifyProduct } from "./classify";

export const ready2orderSite = "Äppelallee (Biebrich)";
export const ready2orderStart = "2026-11-12";

const pageSize = 100;
const userAgent = "ready2order/r2o-api-client-php (github.com/ready2order/r2o-api-client-php)";

export type ReadyItem = {
  item_id?: number | null;
  item_quantity?: number | string | null;
  item_name?: string | null;
  item_total?: number | string | null;
  item_totalNet?: number | string | null;
  item_vat?: number | string | null;
  item_vatRate?: number | string | null;
  item_product_pricePerUnit?: number | string | null;
  item_product_priceNetPerUnit?: number | string | null;
  item_lineDiscountGross?: number | string | null;
  item_lineDiscountNet?: number | string | null;
  item_invoiceDiscountGross?: number | string | null;
  item_invoiceDiscountNet?: number | string | null;
  productgroup_name?: string | null;
  item_testMode?: boolean | null;
};

export type ReadyInvoice = {
  invoice_id?: number | null;
  invoice_timestamp?: string | null;
  invoice_numberFull?: string | null;
  invoice_number?: number | string | null;
  invoice_testMode?: boolean | null;
  invoice_deleted_at?: string | null;
  items?: ReadyItem[] | null;
  payment?: Array<{ billPayment_name?: string | null }> | null;
};

export type TillLine = {
  importKey: string;
  externalInvoiceId: string;
  externalItemId: string;
  zBon: string;
  bookedOn: string;
  bookedAt: string | null;
  invoiceNumber: string;
  paymentMethod: string;
  productName: string;
  productGroup: string;
  quantity: string;
  unitGross: string;
  unitNet: string;
  discountGross: string;
  discountNet: string;
  lineGross: string;
  lineNet: string;
  vatRate: string;
  vatAmount: string;
  businessDate: string;
  siteName: string;
  category: string;
};

export type NewCategory = {
  productName: string;
  category: string;
  groupKey: string;
  role: string;
  countInQuantity: boolean;
  countInRevenue: boolean;
};

export function shiftIsoDate(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, (month ?? 1) - 1, (day ?? 1) + days));
  return shifted.toISOString().slice(0, 10);
}

export function todayInTimeZone(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function syncWindow(input: {
  today: string;
  firstReady: string | null;
  lastReady: string | null;
  lastCsv: string | null;
}): { from: string; to: string } {
  const floor = input.lastCsv ? shiftIsoDate(input.lastCsv, 1) : ready2orderStart;
  const covered = input.firstReady !== null && input.firstReady <= floor;
  const from = covered && input.lastReady ? input.lastReady : floor;
  return { from: from > input.today ? input.today : from, to: input.today };
}

export function stampParts(timestamp: string): { date: string; time: string | null } {
  const trimmed = timestamp.trim();
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(trimmed);
  if (!match) return { date: "", time: null };
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) return { date: match[1]!, time: match[2]! };
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return { date: match[1]!, time: match[2]! };
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(parsed);
  return { date, time };
}

function decimal(value: unknown): string {
  if (value === null || value === undefined || value === "") return "0";
  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? String(number) : "0";
}

function addDecimal(left: unknown, right: unknown): string {
  return String(Number(decimal(left)) + Number(decimal(right)));
}

export function applyReadyInvoices(
  invoices: ReadyInvoice[],
  known: ReadonlyMap<string, string>,
): { lines: TillLine[]; dropInvoiceIds: string[]; categories: NewCategory[] } {
  const lines = new Map<string, TillLine>();
  const dropInvoiceIds: string[] = [];
  const categories = new Map<string, NewCategory>();

  for (const invoice of invoices) {
    if (invoice.invoice_id === null || invoice.invoice_id === undefined) continue;
    if (invoice.invoice_testMode) continue;
    const invoiceId = String(invoice.invoice_id);
    if (invoice.invoice_deleted_at) {
      dropInvoiceIds.push(invoiceId);
      continue;
    }
    const stamp = stampParts(invoice.invoice_timestamp ?? "");
    if (!stamp.date) continue;
    const payment = invoice.payment?.find((item) => item.billPayment_name?.trim())?.billPayment_name?.trim() || "Unbekannt";
    const invoiceNumber = invoice.invoice_numberFull?.trim()
      || (invoice.invoice_number === null || invoice.invoice_number === undefined ? "" : String(invoice.invoice_number))
      || invoiceId;

    for (const item of invoice.items ?? []) {
      if (item.item_testMode) continue;
      if (item.item_id === null || item.item_id === undefined) continue;
      const productName = item.item_name?.trim() ?? "";
      if (!productName) continue;
      const productGroup = item.productgroup_name?.trim() || "Nicht zugeordnet";
      const knownCategory = known.get(productName);
      if (!knownCategory && !categories.has(productName)) {
        const classified = classifyProduct(productGroup, productName);
        categories.set(productName, {
          productName,
          category: productGroup,
          groupKey: classified.groupKey,
          role: classified.role,
          countInQuantity: classified.countInQuantity,
          countInRevenue: classified.countInRevenue,
        });
      }
      const importKey = `ready2order:${invoiceId}:${item.item_id}`;
      lines.set(importKey, {
        importKey,
        externalInvoiceId: invoiceId,
        externalItemId: String(item.item_id),
        zBon: stamp.date,
        bookedOn: stamp.date,
        bookedAt: stamp.time,
        invoiceNumber,
        paymentMethod: payment,
        productName,
        productGroup,
        quantity: decimal(item.item_quantity),
        unitGross: decimal(item.item_product_pricePerUnit),
        unitNet: decimal(item.item_product_priceNetPerUnit),
        discountGross: addDecimal(item.item_lineDiscountGross, item.item_invoiceDiscountGross),
        discountNet: addDecimal(item.item_lineDiscountNet, item.item_invoiceDiscountNet),
        lineGross: decimal(item.item_total),
        lineNet: decimal(item.item_totalNet),
        vatRate: decimal(item.item_vatRate),
        vatAmount: decimal(item.item_vat),
        businessDate: stamp.date,
        siteName: ready2orderSite,
        category: knownCategory ?? productGroup,
      });
    }
  }

  return { lines: [...lines.values()], dropInvoiceIds, categories: [...categories.values()] };
}

type InvoicePage = {
  error?: boolean;
  invoices?: ReadyInvoice[];
  count?: number;
  limit?: number;
};

export async function loadReadyInvoices(input: {
  token: string;
  from: string;
  to: string;
  fetchImpl?: typeof fetch;
}): Promise<ReadyInvoice[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const invoices: ReadyInvoice[] = [];
  const seen = new Set<number>();
  let offset = 0;

  while (true) {
    const url = new URL("https://api.ready2order.com/v1/document/invoice");
    url.searchParams.set("dateFrom", input.from);
    url.searchParams.set("dateTo", input.to);
    url.searchParams.set("dateField", "daily_report");
    url.searchParams.set("items", "true");
    url.searchParams.set("payments", "true");
    url.searchParams.set("testMode", "false");
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: "application/json",
        "User-Agent": userAgent,
      },
    });
    if (response.status === 429) throw new AppError("rate_limited", "ready2order");
    const text = await response.text();
    if (!response.ok || !text.trim().startsWith("{")) throw new AppError("validation", "ready2order");
    const page = JSON.parse(text) as InvoicePage;
    if (page.error) throw new AppError("validation", "ready2order");
    const batch = page.invoices ?? [];
    const fresh = batch.filter((invoice) => {
      const id = Number(invoice.invoice_id);
      if (!Number.isFinite(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (fresh.length === 0) break;
    invoices.push(...fresh);
    const limit = Number(page.limit) > 0 ? Number(page.limit) : pageSize;
    const count = Number(page.count);
    offset += batch.length;
    const fullPage = batch.length >= limit;
    const moreByCount = Number.isFinite(count) && offset < count;
    if (!fullPage && !moreByCount) break;
  }

  return invoices;
}

export async function syncReady2order(input: {
  actor: ActorContext;
  token: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<{ written: number; removed: number; from: string; to: string }> {
  const bounds = await withTenant(input.actor.tenantId, async (tx) => {
    const sites = await rows<{ id: string; timezone: string }>(
      tx,
      sql`
        select id::text as id, timezone
        from locations
        where status = 'active' and name = ${ready2orderSite}
        limit 1
      `,
    );
    const site = sites[0];
    if (!site) throw new AppError("not_found", "location");
    requirePermission(input.actor, "reporting.booked_value.read", site.id);
    const ready = await rows<{ first_date: string | null; last_date: string | null }>(
      tx,
      sql`
        select min(business_date)::text as first_date, max(business_date)::text as last_date
        from pos.lines
        where location_id = ${site.id}::uuid and source = 'ready2order'
      `,
    );
    const csv = await rows<{ last_date: string | null }>(
      tx,
      sql`
        select max(business_date)::text as last_date
        from pos.lines
        where location_id = ${site.id}::uuid and source = 'csv'
      `,
    );
    const today = todayInTimeZone(site.timezone || "Europe/Berlin", input.now);
    return {
      siteId: site.id,
      window: syncWindow({
        today,
        firstReady: ready[0]?.first_date ?? null,
        lastReady: ready[0]?.last_date ?? null,
        lastCsv: csv[0]?.last_date ?? null,
      }),
    };
  });

  const invoices = await loadReadyInvoices({
    token: input.token,
    from: bounds.window.from,
    to: bounds.window.to,
    fetchImpl: input.fetchImpl,
  });

  return withTenant(input.actor.tenantId, async (tx) => {
    const knownRows = await rows<{ product_name: string; category: string }>(
      tx,
      sql`select product_name, category from pos.product_categories`,
    );
    const known = new Map(knownRows.map((row) => [row.product_name, row.category]));
    const applied = applyReadyInvoices(invoices, known);
    let removed = 0;
    for (const invoiceId of applied.dropInvoiceIds) {
      const deleted = await rows<{ id: string }>(
        tx,
        sql`
          delete from pos.lines
          where tenant_id = ${input.actor.tenantId}::uuid
            and source = 'ready2order'
            and external_invoice_id = ${invoiceId}
          returning id::text as id
        `,
      );
      removed += deleted.length;
    }
    for (const category of applied.categories) {
      await tx.execute(sql`
        insert into pos.product_categories (
          tenant_id, product_name, category, group_key, role, count_in_quantity, count_in_revenue
        ) values (
          ${input.actor.tenantId}::uuid,
          ${category.productName},
          ${category.category},
          ${category.groupKey},
          ${category.role},
          ${category.countInQuantity},
          ${category.countInRevenue}
        )
        on conflict (tenant_id, product_name) do nothing
      `);
    }
    for (const line of applied.lines) {
      await tx.execute(sql`
        insert into pos.lines (
          tenant_id, location_id, source, external_invoice_id, external_item_id, import_key,
          z_bon, booked_on, booked_at, invoice_number, payment_method, product_name, product_group,
          quantity, unit_gross, unit_net, discount_gross, discount_net, line_gross, line_net,
          vat_rate, vat_amount, business_date, site_name, category
        ) values (
          ${input.actor.tenantId}::uuid,
          ${bounds.siteId}::uuid,
          'ready2order',
          ${line.externalInvoiceId},
          ${line.externalItemId},
          ${line.importKey},
          ${line.zBon}::date,
          ${line.bookedOn}::date,
          ${line.bookedAt}::time,
          ${line.invoiceNumber},
          ${line.paymentMethod},
          ${line.productName},
          ${line.productGroup},
          ${line.quantity},
          ${line.unitGross},
          ${line.unitNet},
          ${line.discountGross},
          ${line.discountNet},
          ${line.lineGross},
          ${line.lineNet},
          ${line.vatRate},
          ${line.vatAmount},
          ${line.businessDate}::date,
          ${line.siteName},
          ${line.category}
        )
        on conflict (tenant_id, import_key) do update set
          external_invoice_id = excluded.external_invoice_id,
          external_item_id = excluded.external_item_id,
          z_bon = excluded.z_bon,
          booked_on = excluded.booked_on,
          booked_at = excluded.booked_at,
          invoice_number = excluded.invoice_number,
          payment_method = excluded.payment_method,
          product_name = excluded.product_name,
          product_group = excluded.product_group,
          quantity = excluded.quantity,
          unit_gross = excluded.unit_gross,
          unit_net = excluded.unit_net,
          discount_gross = excluded.discount_gross,
          discount_net = excluded.discount_net,
          line_gross = excluded.line_gross,
          line_net = excluded.line_net,
          vat_rate = excluded.vat_rate,
          vat_amount = excluded.vat_amount,
          business_date = excluded.business_date,
          site_name = excluded.site_name,
          category = excluded.category
        where pos.lines.source = 'ready2order'
      `);
    }
    return {
      written: applied.lines.length,
      removed,
      from: bounds.window.from,
      to: bounds.window.to,
    };
  });
}
