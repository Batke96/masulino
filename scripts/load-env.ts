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
    if (existsSync(/*turbopackIgnore: true*/ file)) loadFile(file);
  }
}

function loadFile(file: string): void {
  if (!existsSync(/*turbopackIgnore: true*/ file)) return;
  for (const line of readFileSync(/*turbopackIgnore: true*/ file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
