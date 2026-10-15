import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vinext from "vinext";
import { defineConfig, type Plugin } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { sites } from "./build/sites-vite-plugin";
import { connectorPreview } from "./build/connector-preview-plugin.mjs";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

const localBindingConfig = {
  main: "./build/sites-worker.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

const deployingToVercel = process.env.VERCEL === "1";
const requireFromServer = createRequire(fileURLToPath(new URL("./server/package.json", import.meta.url)));

function serverZodPlugin(): Plugin {
  return {
    name: "masulino-server-zod",
    enforce: "pre",
    resolveId(source) {
      if (this.environment?.name === "client") return null;
      if (source !== "zod" && !source.startsWith("zod/")) return null;
      return requireFromServer.resolve(source);
    },
  };
}

function tslibEsmPlugin(): Plugin {
  const store = fileURLToPath(new URL("./node_modules/.pnpm/", import.meta.url));
  const directory = readdirSync(store).find((name) => name.startsWith("tslib@"));
  const esm = directory ? join(store, directory, "node_modules/tslib/tslib.es6.mjs") : null;
  return {
    name: "masulino-tslib-esm",
    enforce: "pre",
    resolveId(source) {
      if (!esm || source !== "tslib" || this.environment?.name === "client") return null;
      return esm;
    },
  };
}

export default defineConfig(async ({ command }) => {
  const plugins = [
    ...(deployingToVercel ? [serverZodPlugin(), tslibEsmPlugin()] : []),
    vinext(),
    sites({ mockAuth: !managedLinux }),
    connectorPreview(),
  ];

  if (deployingToVercel) {
    const { nitro } = await import("nitro/vite");
    plugins.push(
      ...nitro({
        preset: "vercel",
        vercel: {
          functions: {
            regions: ["fra1"],
          },
        },
      }),
    );
  } else {
    // Use Miniflare's local Request.cf placeholder unless fetching is requested.
    process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
    process.env.WRANGLER_SEND_METRICS ??= "false";

    // Keep Wrangler and Miniflare state project-local. These are non-secret tool
    // settings; application environment belongs in ignored `.env*` files.
    process.env.WRANGLER_WRITE_LOGS ??= "false";
    process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
    process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
    process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

    // Wrangler snapshots its log path while the Cloudflare plugin is imported.
    const { cloudflare } = await import("@cloudflare/vite-plugin");
    plugins.push(
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: {
          ...localBindingConfig,
          ...(command === "serve"
            ? {
                services: [
                  {
                    binding: "CONNECTORS",
                    service: "sites-connector-preview",
                    entrypoint: "ConnectorPreview",
                  },
                ],
              }
            : {}),
        },
        ...(command === "serve"
          ? {
              auxiliaryWorkers: [
                {
                  config: {
                    name: "sites-connector-preview",
                    main: "./build/connector-preview-worker.mjs",
                    compatibility_date: "2026-05-15",
                  },
                },
              ],
            }
          : {}),
      }),
    );
  }

  return {
    resolve: deployingToVercel
      ? undefined
      : {
          alias: {
            "@masulino/server/api-entry": fileURLToPath(new URL("./build/api-local-stub.ts", import.meta.url)),
          },
        },
    server: {
      ...(managedLinux
        ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] }
        : {}),
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
      proxy: {
        "/api": {
          target: process.env.MASULINO_API_URL ?? "http://127.0.0.1:8787",
          changeOrigin: false,
        },
      },
    },
    plugins,
  };
});
