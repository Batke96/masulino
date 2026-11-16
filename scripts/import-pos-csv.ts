import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import pg from "pg";
import { classifyProduct } from "../packages/modules/pos/src/classify.ts";
import { loadRootEnv } from "./load-env";

loadRootEnv();

const filePath = process.argv.slice(2).find((argument) => argument !== "--");
if (!filePath) {
  throw new Error("Pfad zur CSV fehlt. Beispiel: pnpm db:import-pos -- \"/pfad/kassenpositionen.csv\"");
}

const migrateUrl = process.env.DATABASE_URL_MIGRATE;
if (!migrateUrl) throw new Error("Missing DATABASE_URL_MIGRATE");

type CsvRow = {
  importKey: string;
  zBon: string | null;
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

type ProductStat = {
  category: string;
  gross: number;
};

function germanNumber(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "0";
  const negative = trimmed.startsWith("-");
  const digits = trimmed.replace("-", "").replaceAll(".", "").replace(",", ".");
  return `${negative ? "-" : ""}${digits}`;
}

function isoDate(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function timeValue(value: string): string | null {
  const trimmed = value.trim();
  return /^\d{2}:\d{2}:\d{2}$/.test(trimmed) ? trimmed : null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

const client = new pg.Client({ connectionString: migrateUrl });
await client.connect();

const tenantSlug = process.env.MASULINO_POS_TENANT ?? "masulino-spielwelt";
const tenant = await client.query<{ id: string }>("select id from tenants where slug = $1 and status = 'active'", [tenantSlug]);
let tenantId = tenant.rows[0]?.id;
if (!tenantId) {
  const only = await client.query<{ id: string; slug: string }>(
    "select id, slug from tenants where status = 'active' order by created_at",
  );
  if (only.rowCount !== 1) {
    throw new Error(`Betrieb ${tenantSlug} fehlt. Setze MASULINO_POS_TENANT auf den Mandanten-Slug.`);
  }
  tenantId = only.rows[0]!.id;
  console.log(`Mandant ${only.rows[0]!.slug} wird verwendet.`);
}

const locationIds = new Map<string, string>();
async function locationIdFor(siteName: string): Promise<string> {
  const existing = locationIds.get(siteName);
  if (existing) return existing;
  const found = await client.query<{ id: string }>(
    "select id from locations where tenant_id = $1 and name = $2",
    [tenantId, siteName],
  );
  if (found.rows[0]) {
    locationIds.set(siteName, found.rows[0].id);
    return found.rows[0].id;
  }
  const id = randomUUID();
  await client.query(
    `insert into locations (id, tenant_id, slug, name, timezone)
     values ($1, $2, $3, $4, 'Europe/Berlin')`,
    [id, tenantId, slugify(siteName), siteName],
  );
  locationIds.set(siteName, id);
  console.log(`Standort angelegt: ${siteName}`);
  return id;
}

await client.query("delete from pos.lines where tenant_id = $1 and source = 'csv'", [tenantId]);

const products = new Map<string, Map<string, ProductStat>>();
const batch: CsvRow[] = [];
let skipped = 0;
let inserted = 0;
let rowNumber = 0;

async function flush(): Promise<void> {
  if (batch.length === 0) return;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameter = 1;
  for (const row of batch) {
    const locationId = await locationIdFor(row.siteName);
    const columns = [
      tenantId,
      locationId,
      "csv",
      row.importKey,
      row.zBon,
      row.bookedOn,
      row.bookedAt,
      row.invoiceNumber,
      row.paymentMethod,
      row.productName,
      row.productGroup,
      row.quantity,
      row.unitGross,
      row.unitNet,
      row.discountGross,
      row.discountNet,
      row.lineGross,
      row.lineNet,
      row.vatRate,
      row.vatAmount,
      row.businessDate,
      row.siteName,
      row.category,
    ];
    placeholders.push(`(${columns.map(() => `$${parameter++}`).join(", ")})`);
    values.push(...columns);
  }
  await client.query(
    `insert into pos.lines (
      tenant_id, location_id, source, import_key, z_bon, booked_on, booked_at,
      invoice_number, payment_method, product_name, product_group, quantity,
      unit_gross, unit_net, discount_gross, discount_net, line_gross, line_net,
      vat_rate, vat_amount, business_date, site_name, category
    ) values ${placeholders.join(", ")}`,
    values,
  );
  inserted += batch.length;
  batch.length = 0;
  if (inserted % 20000 < 400) console.log(`${inserted} Positionen`);
}

const lines = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
let header = true;
for await (const line of lines) {
  if (header) {
    header = false;
    continue;
  }
  if (!line.trim()) continue;
  rowNumber += 1;
  const cells = splitCsv(line);
  const businessDate = isoDate(cells[16] ?? "");
  const bookedOn = isoDate(cells[1] ?? "") ?? businessDate;
  const siteName = (cells[20] ?? "").trim();
  if (siteName !== "Äppelallee (Biebrich)") {
    skipped += 1;
    continue;
  }
  const productName = (cells[5] ?? "").trim();
  const category = (cells[21] ?? "").trim() || "Nicht zugeordnet";
  if (!businessDate || !bookedOn || !siteName || !productName) {
    skipped += 1;
    continue;
  }
  const lineGross = Number(germanNumber(cells[12] ?? "0"));
  const byCategory = products.get(productName) ?? new Map<string, ProductStat>();
  const stat = byCategory.get(category) ?? { category, gross: 0 };
  stat.gross += Math.abs(lineGross);
  byCategory.set(category, stat);
  products.set(productName, byCategory);
  batch.push({
    importKey: createHash("sha256").update(`${rowNumber}\0${line}`).digest("hex"),
    zBon: isoDate(cells[0] ?? ""),
    bookedOn,
    bookedAt: timeValue(cells[2] ?? ""),
    invoiceNumber: (cells[3] ?? "").trim(),
    paymentMethod: (cells[4] ?? "").trim(),
    productName,
    productGroup: (cells[6] ?? "").trim(),
    quantity: germanNumber(cells[7] ?? "0"),
    unitGross: germanNumber(cells[8] ?? "0"),
    unitNet: germanNumber(cells[9] ?? "0"),
    discountGross: germanNumber(cells[10] ?? "0"),
    discountNet: germanNumber(cells[11] ?? "0"),
    lineGross: germanNumber(cells[12] ?? "0"),
    lineNet: germanNumber(cells[13] ?? "0"),
    vatRate: germanNumber(cells[14] ?? "0"),
    vatAmount: germanNumber(cells[15] ?? "0"),
    businessDate,
    siteName,
    category,
  });
  if (batch.length >= 400) await flush();
}
await flush();

for (const [productName, byCategory] of products) {
  const winner = [...byCategory.values()].sort((a, b) => b.gross - a.gross)[0];
  if (!winner) continue;
  const classified = classifyProduct(winner.category, productName);
  await client.query(
    `insert into pos.product_categories (
      tenant_id, product_name, category, group_key, role, count_in_quantity, count_in_revenue
    ) values ($1, $2, $3, $4, $5, $6, $7)
    on conflict (tenant_id, product_name) do update set
      category = excluded.category,
      group_key = excluded.group_key,
      role = excluded.role,
      count_in_quantity = excluded.count_in_quantity,
      count_in_revenue = excluded.count_in_revenue`,
    [
      tenantId,
      productName,
      winner.category,
      classified.groupKey,
      classified.role,
      classified.countInQuantity,
      classified.countInRevenue,
    ],
  );
}

const summary = await client.query<{ site_name: string; rows: string }>(
  `select site_name, count(*)::text as rows
   from pos.lines
   where tenant_id = $1 and source = 'csv'
   group by site_name
   order by site_name`,
  [tenantId],
);
console.log(`Import fertig. ${inserted} Positionen, ${skipped} übersprungen, ${products.size} Produkte.`);
for (const row of summary.rows) console.log(`  ${row.site_name}: ${row.rows}`);
await client.end();

function splitCsv(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === ";" && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}
