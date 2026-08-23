import { readFileSync, existsSync } from "node:fs";

// Vitest setupFiles run before any app/test module loads — and before
// "dotenv/config" is imported anywhere — so load .env here first.
function loadEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnv();

// Force ALL database access onto the dedicated test database so the dev
// database can never be truncated by a test run.
process.env.TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL?.replace(/\/[^/?]+(\?|$)/, "/ledger_test$1");

if (!process.env.TEST_DATABASE_URL || !/ledger_test/.test(process.env.TEST_DATABASE_URL)) {
  throw new Error(
    "TEST_DATABASE_URL must point at the ledger_test database — refusing to run integration tests against the dev database.",
  );
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
if (process.env.APP_DATABASE_URL) {
  process.env.APP_DATABASE_URL = process.env.APP_DATABASE_URL.replace(
    /\/[^/?]+(\?|$)/,
    "/ledger_test$1",
  );
}
