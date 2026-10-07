import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.cwd(), ".data/test-env.json");
Object.assign(process.env, JSON.parse(readFileSync(file, "utf8")) as Record<string, string>);
process.env.NODE_ENV = "test";
