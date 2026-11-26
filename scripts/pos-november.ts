import { applyReadyInvoices, loadReadyInvoices } from "../packages/modules/pos/src/sync.ts";
import { loadRootEnv } from "./load-env";

loadRootEnv();

const token = process.env.READY2ORDER_ACCOUNT_TOKEN?.trim();
if (!token) throw new Error("READY2ORDER_ACCOUNT_TOKEN fehlt in .env");

const from = "2026-11-01";
const to = "2026-11-30";
const invoices = await loadReadyInvoices({ token, from, to });
const { lines } = applyReadyInvoices(invoices, new Map());
const gross = lines.reduce((sum, line) => sum + Number(line.lineGross), 0);
const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(gross);

console.log(`${from} bis ${to}: ${invoices.length} Belege, ${lines.length} Positionen`);
console.log(`Umsatz ${money}`);
