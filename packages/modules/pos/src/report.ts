import { AppError } from "@masulino/contracts";
import { authorize, requirePermission, type ActorContext } from "@masulino/core";
import { rows, withTenant, type Tx } from "@masulino/database";
import { sql } from "drizzle-orm";
import {
  daysInMonth,
  fractionalChange,
  monthSpan,
  shiftMonth,
  weekdayOf,
  weekdayTargets,
  yearSpan,
  type DayTotal,
} from "./targets";

const preferredSite = "Äppelallee (Biebrich)";

export type PosMetric = {
  value: number;
  delta: number | null;
  trend: number[];
};

export type PosReport = {
  empty: boolean;
  locationId: string;
  siteName: string;
  sites: Array<{ locationId: string; name: string }>;
  view: "month" | "year";
  month: string | null;
  year: number | null;
  months: string[];
  years: number[];
  incomplete: boolean;
  throughDate: string | null;
  comparisonLabel: string;
  targetLabel: string | null;
  cards: {
    gross: PosMetric;
    payingChildren: PosMetric;
    grossPerChild: PosMetric;
    receipts: PosMetric;
  };
  gastroPerChild: number | null;
  chipsPerChild: number | null;
  parties: number;
  mix: Array<{ key: string; label: string; gross: number; quantity: number }>;
  categories: Array<{ category: string; groupKey: string; gross: number; quantity: number; parties: number }>;
  products: Array<{ name: string; category: string; gross: number; quantity: number }>;
  trend: Array<{ month: string; gross: number; quantity: number; previousGross: number | null; previousQuantity: number | null }>;
  days: Array<{
    date: string;
    gross: number | null;
    quantity: number | null;
    targetGross: number | null;
    targetQuantity: number | null;
    partial: boolean;
    future: boolean;
  }>;
};

type SiteRow = { id: string; name: string };
type MonthRow = { month: string };
type TotalRow = {
  gross: number;
  quantity: number;
  paying_children: number;
  receipts: number;
  gastro_gross: number;
  chips_quantity: number;
  parties: number;
};
type SeriesRow = { month: string; gross: number; quantity: number; paying_children: number; receipts: number };
type CategoryRow = { category: string; group_key: string; gross: number; quantity: number; parties: number };
type ProductRow = { product_name: string; category: string; gross: number; quantity: number };
type DayRow = { date: string; gross: number; quantity: number };
type LastRow = { last_date: string | null };

const groupLabel: Record<string, string> = {
  eintritt: "Eintritt",
  gastro: "Gastro",
  geburtstag: "Geburtstag",
  chips: "Chips",
  sonstiges: "Sonstige",
};

const monthNames = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveMonth(requested: string | undefined, months: string[], view: "month" | "year"): string {
  if (requested && months.includes(requested)) return requested;
  if (requested && view === "year") {
    const inYear = months.filter((item) => item.startsWith(requested.slice(0, 4)));
    if (inYear.length > 0) return inYear[inYear.length - 1]!;
  }
  return months[months.length - 1]!;
}

function monthTitle(month: string): string {
  const [year, monthIndex] = month.split("-");
  return `${monthNames[Number(monthIndex) - 1]} ${year}`;
}

function canRead(actor: ActorContext, locationId: string): boolean {
  return authorize({ ...actor, locationId }, "reporting.booked_value.read").allow;
}

function metric(value: number, previous: number, trend: number[]): PosMetric {
  return { value, delta: fractionalChange(value, previous), trend };
}

export async function readPosReport(args: {
  actor: ActorContext;
  locationId: string;
  month?: string;
  view: "month" | "year";
}): Promise<PosReport> {
  if (args.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month)) {
    throw new AppError("validation", "month");
  }
  return withTenant(args.actor.tenantId, async (tx) => {
    const siteRows = await rows<SiteRow>(
      tx,
      sql`
        select l.id::text as id, l.name
        from locations l
        where l.status = 'active'
          and exists (select 1 from pos.lines p where p.location_id = l.id)
        order by l.name
      `,
    );
    const sites = siteRows.filter((site) => canRead(args.actor, site.id));
    const requested = sites.find((site) => site.id === args.locationId);
    const preferred = sites.find((site) => site.name === preferredSite);
    const site = requested ?? preferred ?? sites[0] ?? null;
    if (!site) {
      requirePermission(args.actor, "reporting.booked_value.read", args.locationId);
      return emptyReport(args.locationId, "", args.view);
    }
    requirePermission(args.actor, "reporting.booked_value.read", site.id);

    const monthRows = await rows<MonthRow>(
      tx,
      sql`
        select to_char(business_date, 'YYYY-MM') as month
        from pos.lines
        where location_id = ${site.id}::uuid
        group by 1
        order by 1
      `,
    );
    const months = monthRows.map((row) => row.month);
    if (months.length === 0) return emptyReport(site.id, site.name, args.view, sites);
    const month = resolveMonth(args.month, months, args.view);
    const year = Number(month.slice(0, 4));
    const years = [...new Set(months.map((item) => Number(item.slice(0, 4))))];
    const last = await rows<LastRow>(
      tx,
      sql`select max(business_date)::text as last_date from pos.lines where location_id = ${site.id}::uuid`,
    );
    const lastDate = last[0]?.last_date ?? null;
    const span = args.view === "year" ? yearSpan(year) : monthSpan(month);
    const previousSpan = args.view === "year" ? yearSpan(year - 1) : monthSpan(shiftMonth(month, -1));
    const current = await periodTotal(tx, site.id, span.from, span.to);
    const previous = await periodTotal(tx, site.id, previousSpan.from, previousSpan.to);
    const trendStart = `${year - 1}-01-01`;
    const trendEnd = `${year + 1}-01-01`;
    const series = await rows<SeriesRow>(
      tx,
      sql`
        select to_char(l.business_date, 'YYYY-MM') as month,
               coalesce(sum(l.line_gross), 0)::float8 as gross,
               coalesce(sum(l.quantity) filter (where coalesce(c.count_in_quantity, true)), 0)::float8 as quantity,
               coalesce(sum(l.quantity) filter (where c.role = 'paying_child' and l.line_gross <> 0), 0)::float8 as paying_children,
               count(distinct l.invoice_number)::int as receipts
        from pos.lines l
        left join pos.product_categories c
          on c.tenant_id = l.tenant_id and c.product_name = l.product_name
        where l.location_id = ${site.id}::uuid
          and l.business_date >= ${trendStart}::date
          and l.business_date < ${trendEnd}::date
        group by 1
        order by 1
      `,
    );
    const categories = await rows<CategoryRow>(
      tx,
      sql`
        select l.category,
               coalesce(min(c.group_key), 'sonstiges') as group_key,
               coalesce(sum(l.line_gross), 0)::float8 as gross,
               coalesce(sum(l.quantity) filter (where coalesce(c.count_in_quantity, true)), 0)::float8 as quantity,
               count(distinct l.invoice_number) filter (where c.role = 'party' and l.line_gross > 0)::int as parties
        from pos.lines l
        left join pos.product_categories c
          on c.tenant_id = l.tenant_id and c.product_name = l.product_name
        where l.location_id = ${site.id}::uuid
          and l.business_date >= ${span.from}::date
          and l.business_date < ${span.to}::date
        group by l.category
        order by gross desc
      `,
    );
    const products = await rows<ProductRow>(
      tx,
      sql`
        select l.product_name,
               l.category,
               coalesce(sum(l.line_gross), 0)::float8 as gross,
               coalesce(sum(l.quantity) filter (where coalesce(c.count_in_quantity, true)), 0)::float8 as quantity
        from pos.lines l
        left join pos.product_categories c
          on c.tenant_id = l.tenant_id and c.product_name = l.product_name
        where l.location_id = ${site.id}::uuid
          and l.business_date >= ${span.from}::date
          and l.business_date < ${span.to}::date
          and coalesce(c.role, '') <> 'ignore'
        group by l.product_name, l.category
        order by gross desc
      `,
    );
    const dayRows = await rows<DayRow>(
      tx,
      sql`
        select l.business_date::text as date,
               coalesce(sum(l.line_gross), 0)::float8 as gross,
               coalesce(sum(l.quantity) filter (where coalesce(c.count_in_quantity, true)), 0)::float8 as quantity
        from pos.lines l
        left join pos.product_categories c
          on c.tenant_id = l.tenant_id and c.product_name = l.product_name
        where l.location_id = ${site.id}::uuid
          and l.business_date >= ${monthSpan(month).from}::date
          and l.business_date < ${monthSpan(month).to}::date
        group by l.business_date
        order by l.business_date
      `,
    );

    const byMonth = new Map(series.map((row) => [row.month, row]));
    const trail = args.view === "year"
      ? monthNames.map((_, index) => `${year}-${String(index + 1).padStart(2, "0")}`)
      : Array.from({ length: 8 }, (_, index) => shiftMonth(month, index - 7));
    const grossTrend = trail.map((item) => num(byMonth.get(item)?.gross));
    const childTrend = trail.map((item) => num(byMonth.get(item)?.paying_children));
    const receiptTrend = trail.map((item) => num(byMonth.get(item)?.receipts));
    const perChildTrend = trail.map((item) => {
      const row = byMonth.get(item);
      const children = num(row?.paying_children);
      return children > 0 ? num(row?.gross) / children : 0;
    });
    const currentGross = num(current.gross);
    const previousGross = num(previous.gross);
    const currentChildren = num(current.paying_children);
    const previousChildren = num(previous.paying_children);
    const currentReceipts = num(current.receipts);
    const previousReceipts = num(previous.receipts);
    const currentPerChild = currentChildren > 0 ? currentGross / currentChildren : 0;
    const previousPerChild = previousChildren > 0 ? previousGross / previousChildren : 0;
    const monthEnd = daysInMonth(month).at(-1) ?? `${month}-01`;
    const incomplete = lastDate !== null && lastDate >= `${month}-01` && lastDate < monthEnd && lastDate.slice(0, 7) === month
      ? true
      : args.view === "year" && lastDate !== null && lastDate.slice(0, 4) === String(year) && lastDate < `${year}-12-31`;
    const throughDate = incomplete ? lastDate : null;
    const historyYear = year - 1;
    const historyDays = await rows<DayRow>(
      tx,
      sql`
        select l.business_date::text as date,
               coalesce(sum(l.line_gross), 0)::float8 as gross,
               coalesce(sum(l.quantity) filter (where coalesce(c.count_in_quantity, true)), 0)::float8 as quantity
        from pos.lines l
        left join pos.product_categories c
          on c.tenant_id = l.tenant_id and c.product_name = l.product_name
        where l.location_id = ${site.id}::uuid
          and extract(month from l.business_date) = ${Number(month.slice(5, 7))}
          and extract(year from l.business_date) < ${year}
        group by l.business_date
      `,
    );
    const ownClosedDays: DayTotal[] = dayRows
      .filter((row) => throughDate === null || row.date < throughDate)
      .map((row) => ({ date: row.date, gross: num(row.gross), quantity: num(row.quantity) }));
    const priorDays: DayTotal[] = historyDays.map((row) => ({
      date: row.date,
      gross: num(row.gross),
      quantity: num(row.quantity),
    }));
    const targetSource = priorDays.length > 0 ? priorDays : ownClosedDays;
    const targets = weekdayTargets(targetSource);
    const targetLabel = priorDays.length > 0
      ? `${monthNames[Number(month.slice(5, 7)) - 1]} ${historyYear}`
      : targetSource.length > 0
        ? "dieser Monat"
        : null;
    const actualByDate = new Map(dayRows.map((row) => [row.date, row]));
    const days = args.view === "month"
      ? daysInMonth(month).map((date) => {
          const actual = actualByDate.get(date);
          const future = throughDate !== null && date > throughDate;
          const target = targets.get(weekdayOf(date));
          return {
            date,
            gross: future ? null : num(actual?.gross),
            quantity: future ? null : num(actual?.quantity),
            targetGross: target?.gross ?? null,
            targetQuantity: target?.quantity ?? null,
            partial: throughDate === date,
            future,
          };
        })
      : [];
    const trendMonths = args.view === "year"
      ? monthNames.map((_, index) => `${year}-${String(index + 1).padStart(2, "0")}`)
      : months.filter((item) => item.startsWith(String(year)));
    const mixMap = new Map<string, { gross: number; quantity: number }>();
    for (const row of categories) {
      const key = row.group_key || "sonstiges";
      const currentMix = mixMap.get(key) ?? { gross: 0, quantity: 0 };
      currentMix.gross += num(row.gross);
      currentMix.quantity += num(row.quantity);
      mixMap.set(key, currentMix);
    }
    const comparisonLabel = args.view === "year"
      ? `gegen ${year - 1}`
      : `gegen ${monthTitle(shiftMonth(month, -1))}`;

    return {
      empty: false,
      locationId: site.id,
      siteName: site.name,
      sites: sites.map((item) => ({ locationId: item.id, name: item.name })),
      view: args.view,
      month,
      year,
      months,
      years,
      incomplete,
      throughDate,
      comparisonLabel: previousGross === 0 && previousChildren === 0 && previousReceipts === 0
        ? "Kein Vergleichszeitraum"
        : comparisonLabel,
      targetLabel,
      cards: {
        gross: metric(currentGross, previousGross, grossTrend),
        payingChildren: metric(currentChildren, previousChildren, childTrend),
        grossPerChild: metric(currentPerChild, previousPerChild, perChildTrend),
        receipts: metric(currentReceipts, previousReceipts, receiptTrend),
      },
      gastroPerChild: currentChildren > 0 ? num(current.gastro_gross) / currentChildren : null,
      chipsPerChild: currentChildren > 0 ? num(current.chips_quantity) / currentChildren : null,
      parties: num(current.parties),
      mix: [...mixMap.entries()]
        .map(([key, value]) => ({ key, label: groupLabel[key] ?? key, gross: value.gross, quantity: value.quantity }))
        .sort((a, b) => b.gross - a.gross),
      categories: categories.map((row) => ({
        category: row.category,
        groupKey: row.group_key,
        gross: num(row.gross),
        quantity: num(row.quantity),
        parties: num(row.parties),
      })),
      products: products.map((row) => ({
        name: row.product_name,
        category: row.category,
        gross: num(row.gross),
        quantity: num(row.quantity),
      })),
      trend: trendMonths.map((item) => {
        const currentRow = byMonth.get(item);
        const previousRow = byMonth.get(`${Number(item.slice(0, 4)) - 1}${item.slice(4)}`);
        return {
          month: item,
          gross: num(currentRow?.gross),
          quantity: num(currentRow?.quantity),
          previousGross: previousRow ? num(previousRow.gross) : null,
          previousQuantity: previousRow ? num(previousRow.quantity) : null,
        };
      }),
      days,
    };
  });
}

async function periodTotal(tx: Tx, locationId: string, from: string, to: string): Promise<TotalRow> {
  const found = await rows<TotalRow>(
    tx,
    sql`
      select coalesce(sum(l.line_gross), 0)::float8 as gross,
             coalesce(sum(l.quantity) filter (where coalesce(c.count_in_quantity, true)), 0)::float8 as quantity,
             coalesce(sum(l.quantity) filter (where c.role = 'paying_child' and l.line_gross <> 0), 0)::float8 as paying_children,
             count(distinct l.invoice_number)::int as receipts,
             coalesce(sum(l.line_gross) filter (where c.group_key = 'gastro'), 0)::float8 as gastro_gross,
             coalesce(sum(l.quantity) filter (where c.role = 'chip'), 0)::float8 as chips_quantity,
             count(distinct l.invoice_number) filter (where c.role = 'party' and l.line_gross > 0)::int as parties
      from pos.lines l
      left join pos.product_categories c
        on c.tenant_id = l.tenant_id and c.product_name = l.product_name
      where l.location_id = ${locationId}::uuid
        and l.business_date >= ${from}::date
        and l.business_date < ${to}::date
    `,
  );
  return found[0] ?? {
    gross: 0,
    quantity: 0,
    paying_children: 0,
    receipts: 0,
    gastro_gross: 0,
    chips_quantity: 0,
    parties: 0,
  };
}

function emptyReport(locationId: string, siteName: string, view: "month" | "year", sites: SiteRow[] = []): PosReport {
  const blank: PosMetric = { value: 0, delta: null, trend: [] };
  return {
    empty: true,
    locationId,
    siteName,
    sites: sites.map((site) => ({ locationId: site.id, name: site.name })),
    view,
    month: null,
    year: null,
    months: [],
    years: [],
    incomplete: false,
    throughDate: null,
    comparisonLabel: "Kein Vergleichszeitraum",
    targetLabel: null,
    cards: { gross: blank, payingChildren: blank, grossPerChild: blank, receipts: blank },
    gastroPerChild: null,
    chipsPerChild: null,
    parties: 0,
    mix: [],
    categories: [],
    products: [],
    trend: [],
    days: [],
  };
}
