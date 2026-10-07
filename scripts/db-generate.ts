import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve(process.cwd(), "packages/database/migrations");
const files = readdirSync(dir).filter((file) => file.endsWith(".sql")).sort();
if (files.length === 0) {
  throw new Error("No SQL migrations found");
}
for (const file of files) {
  const sql = readFileSync(resolve(dir, file), "utf8");
  if (!sql.startsWith("-- Masulino migration")) {
    throw new Error(`${file} is missing the reviewed migration header`);
  }
}
console.log(`Reviewed SQL migrations: ${files.join(", ")}`);
