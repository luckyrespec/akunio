import "dotenv/config";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  // Serial: all specs share one cold `bun run dev` + one Postgres.
  // Parallel workers starve the dev server (bcrypt + Turbopack compiles)
  // and make navigations time out and hydration races far more likely.
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "bun run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    // E2E runs against the isolated `e2e` Neon branch (app data + auth),
    // never the dev branch. Values come from gitignored .env.
    env: {
      AI_MOCK: "1",
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
      APP_DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
      NEON_AUTH_BASE_URL: process.env.E2E_NEON_AUTH_BASE_URL ?? "",
      NEON_AUTH_COOKIE_SECRET: process.env.NEON_AUTH_COOKIE_SECRET ?? "",
    },
  },
});
