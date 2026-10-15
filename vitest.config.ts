import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/**/*.test.ts", "server/**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          include: ["packages/**/*.integration.test.ts", "server/**/*.integration.test.ts"],
          exclude: ["**/node_modules/**"],
          environment: "node",
          fileParallelism: false,
          maxWorkers: 1,
          minWorkers: 1,
          globalSetup: ["./scripts/vitest-global-setup.ts"],
          setupFiles: ["./scripts/vitest-setup.ts"],
          testTimeout: 30000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});
