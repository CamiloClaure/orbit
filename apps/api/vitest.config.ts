import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      // One-off scripts/tooling, not business logic — same reasoning PLAN.md
      // gives for excluding apps/web visual primitives from this metric.
      exclude: [
        "dist/**",
        "vitest.config.ts",
        "drizzle.config.ts",
        "src/db/migrate.ts",
        "src/db/seed.ts",
        "src/db/test_seed.mjs",
        "src/server.ts",
      ],
      thresholds: {
        lines: 85,
        branches: 85,
        functions: 85,
        statements: 85,
      },
    },
  },
});
