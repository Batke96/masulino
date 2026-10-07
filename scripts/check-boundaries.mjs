import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const rules = [
  { packageDir: "packages/core", forbidden: ["@masulino/reservations", "@masulino/indoor-play", "@masulino/notices", "@masulino/workforce", "@masulino/operations", "@masulino/contacts", "@masulino/marketing", "@masulino/loyalty", "react", "next", "better-auth"] },
  { packageDir: "packages/contracts", forbidden: ["@masulino/database", "@masulino/core", "react", "drizzle-orm"] },
  { packageDir: "packages/verticals/indoor-play", forbidden: ["@masulino/database", "@masulino/core", "react", "drizzle-orm"] },
  { packageDir: "packages/modules/reservations", forbidden: ["@masulino/indoor-play", "@masulino/notices", "@masulino/workforce", "@masulino/operations", "@masulino/contacts", "@masulino/marketing", "@masulino/loyalty", "react", "next/", "better-auth"] },
  { packageDir: "packages/modules/notices", forbidden: ["@masulino/indoor-play", "@masulino/reservations", "@masulino/workforce", "@masulino/operations", "@masulino/contacts", "@masulino/marketing", "@masulino/loyalty", "react", "next/", "better-auth"] },
  { packageDir: "packages/modules/workforce", forbidden: ["@masulino/indoor-play", "@masulino/reservations", "@masulino/operations", "@masulino/contacts", "@masulino/marketing", "@masulino/loyalty", "react", "next/", "better-auth"] },
  { packageDir: "packages/modules/operations", forbidden: ["@masulino/indoor-play", "@masulino/reservations", "@masulino/workforce", "@masulino/contacts", "@masulino/marketing", "@masulino/loyalty", "react", "next/", "better-auth"] },
  { packageDir: "packages/modules/contacts", forbidden: ["@masulino/indoor-play", "@masulino/reservations", "@masulino/workforce", "@masulino/operations", "@masulino/notices", "@masulino/marketing", "@masulino/loyalty", "react", "next/", "better-auth"] },
  { packageDir: "packages/modules/marketing", forbidden: ["@masulino/indoor-play", "@masulino/reservations", "@masulino/workforce", "@masulino/operations", "@masulino/notices", "@masulino/contacts", "@masulino/loyalty", "react", "next/", "better-auth"] },
  { packageDir: "packages/modules/loyalty", forbidden: ["@masulino/indoor-play", "@masulino/reservations", "@masulino/workforce", "@masulino/operations", "@masulino/notices", "@masulino/contacts", "@masulino/marketing", "react", "next/", "better-auth"] },
];

const importPattern = /from\s+["']([^"']+)["']/g;
let failed = false;

for (const rule of rules) {
  const dir = resolve(root, rule.packageDir);
  for (const file of walk(dir)) {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
    if (file.endsWith(".test.ts")) continue;
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(importPattern)) {
      const specifier = match[1] ?? "";
      if (rule.forbidden.some((item) => specifier === item || specifier.startsWith(`${item}/`))) {
        console.error(`${file} imports forbidden module ${specifier}`);
        failed = true;
      }
    }
  }
}

if (failed) process.exit(1);
console.log("Package boundaries ok");

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === "dist") return [];
    return entry.isDirectory() ? walk(path) : [path];
  });
}
