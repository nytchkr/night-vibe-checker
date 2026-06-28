// ============================================================
// Night Vibe Checker — Vitest configuration
//
// Used for unit and integration tests (src/**/__tests__/**).
// E2E tests are handled separately by Playwright (playwright.config.ts).
//
// Key decisions:
//   - jsdom environment: lets us import Next.js server utilities that
//     reference browser globals without crashing.
//   - @/ alias is configured manually so imports work without modification.
//   - Coverage thresholds are conservative for an MVP — focus on the AI
//     parsing logic and route handlers that protect against data corruption.
// ============================================================

import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // node environment: the unit/integration tests target server-side modules
    // (AI, routes, rate limiter). ai.ts explicitly throws when window is defined,
    // so jsdom would cause the entire module to fail to import.
    environment: "node",

    // Global test helpers (describe, it, expect, vi) without explicit imports
    globals: true,

    // Run setup file before each test file
    setupFiles: ["./src/test/setup.ts"],

    // Only run Vitest tests — exclude Playwright spec files
    include: [
      "src/**/__tests__/**/*.test.ts",
      "src/**/__tests__/**/*.test.tsx",
      "src/**/__tests__/**/*.spec.ts",
      "src/**/__tests__/**/*.spec.tsx",
    ],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],

    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",

      // Files to include in coverage analysis
      include: ["src/lib/**/*.ts", "src/app/api/**/*.ts"],
      exclude: [
        "src/**/__tests__/**",
        "src/test/**",
        "**/*.d.ts",
        "src/types/**",
      ],

      // MVP coverage thresholds — realistic, not aspirational.
      // Branches at 60% acknowledges the many happy-path-only API routes.
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },

    // Resolve the same alias used by tsconfig.json.
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only.ts"),
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only.ts"),
    },
  },
});
