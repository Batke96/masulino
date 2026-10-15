import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadRootEnv(): void {
  const root = process.cwd();
  const candidates = [
    resolve(/*turbopackIgnore: true*/ root, ".env"),
    resolve(/*turbopackIgnore: true*/ root, ".env.local"),
    resolve(/*turbopackIgnore: true*/ root, "..", ".env"),
    resolve(/*turbopackIgnore: true*/ root, "..", ".env.local"),
    resolve(/*turbopackIgnore: true*/ root, "../..", ".env"),
    resolve(/*turbopackIgnore: true*/ root, "../..", ".env.local"),
  ];
  for (const file of candidates) {
    if (existsSync(/*turbopackIgnore: true*/ file)) loadFile(file, false);
  }
}

/**
 * Load laptop-only Neon / Vercel operator secrets.
 * Overrides local `.env` so `pnpm staff:add` stays short.
 * File is gitignored — never commit it.
 */
export function loadProductionOperatorEnv(): void {
  const file = resolve(/*turbopackIgnore: true*/ process.cwd(), ".env.production.local");
  if (!existsSync(/*turbopackIgnore: true*/ file)) {
    throw new Error(
      "Missing .env.production.local. Copy .env.production.local.example, fill Neon/Vercel values, keep the file untracked.",
    );
  }
  loadFile(file, true);
}

function loadFile(file: string, override: boolean): void {
  if (!existsSync(/*turbopackIgnore: true*/ file)) return;
  for (const line of readFileSync(/*turbopackIgnore: true*/ file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (override || process.env[key] === undefined) process.env[key] = value;
  }
}
