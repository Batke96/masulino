#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { isPostgresReady, postgresUrl, waitForPostgres } from "./postgres-ready.mjs";

const root = resolve(import.meta.dirname, "..");
const children = [];

function run(command, args, name, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: false,
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`[${name}] stopped by ${signal}`);
      shutdown(1);
      return;
    }
    if (code && code !== 0) {
      console.error(`[${name}] exited with ${code}`);
      shutdown(code);
    }
  });
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null && !child.killed) {
      child.kill("SIGTERM");
    }
  }
  process.exit(code);
}

function runToCompletion(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      env: process.env,
      shell: false,
    });
    child.on("exit", (code) => {
      if (code === 0) resolvePromise(undefined);
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function waitForApi(port = 8787, attempts = 90) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // retry
    }
    await delay(500);
  }
  throw new Error(`API did not become ready on port ${port}`);
}

const adminUrl = postgresUrl("postgres");
const databaseUrl = postgresUrl("masulino");
if (await isPostgresReady(adminUrl)) {
  await runToCompletion("pnpm", ["exec", "tsx", "scripts/db-up.ts"]);
} else {
  console.log("Starting local Postgres…");
  run("pnpm", ["exec", "tsx", "scripts/db-up.ts"], "db");
  await waitForPostgres(databaseUrl);
}

console.log("Seeding synthetic data…");
const seed = spawn("pnpm", ["exec", "tsx", "scripts/seed.ts"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
await new Promise((resolvePromise, reject) => {
  seed.on("exit", (code) => {
    if (code === 0) resolvePromise(undefined);
    else reject(new Error(`seed exited with ${code}`));
  });
});

console.log("Starting Node API…");
run("pnpm", ["--filter", "@masulino/server", "dev"], "api");
await waitForApi(Number(process.env.MASULINO_API_PORT ?? 8787));

console.log("Starting UI with workspace mode and /api proxy…");
run("pnpm", ["dev"], "ui", {
  MASULINO_WORKSPACE: "1",
  VITE_MASULINO_WORKSPACE: "1",
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
