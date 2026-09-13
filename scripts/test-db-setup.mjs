import { readFileSync, existsSync } from "node:fs";
import { Client } from "pg";

// Loads .env manually so this runs before any app code.
function loadEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnv();

const ADMIN_URL = process.env.TEST_DATABASE_URL
  ? process.env.TEST_DATABASE_URL.replace(/\/[^/?]+(\?|$)/, "/postgres$1")
  : process.env.DATABASE_URL;
const TEST_DB = process.env.TEST_DB_NAME ?? "ledger_test";

if (!ADMIN_URL) {
  console.error("DATABASE_URL or TEST_DATABASE_URL is required in .env");
  process.exit(1);
}

// Derive the test URL from the admin URL.
const testUrl = process.env.TEST_DATABASE_URL ?? ADMIN_URL.replace(/\/[^/?]+(\?|$)/, `/${TEST_DB}$1`);

// 1. Create the test database if missing (connect to the admin DB first).
const adminDb = ADMIN_URL.replace(/\/[^/?]+(\?|$)/, "/postgres$1");
{
  const c = new Client({ connectionString: adminDb });
  await c.connect();
  const exists = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [TEST_DB]);
  if (exists.rowCount === 0) {
    console.log(`creating database ${TEST_DB} ...`);
    await c.query(`CREATE DATABASE ${TEST_DB}`);
  }
  // Mirror the dev grants on the test DB (idempotent).
  await c.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user LOGIN PASSWORD 'app_pw';
      END IF;
    END $$;
  `);
  await c.end();
}

// 1b. Mirror dev grants INSIDE the test DB, before migrations run, so
//     ALTER DEFAULT PRIVILEGES covers every table the migration creates.
{
  const c = new Client({ connectionString: testUrl });
  await c.connect();
  await c.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user LOGIN PASSWORD 'app_pw';
      END IF;
    END $$;
  `);
  await c.query(`GRANT ALL ON SCHEMA public TO app_user`);
  await c.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO app_user`,
  );
  await c.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO app_user`,
  );
  // Cover tables created before this grant existed (reruns).
  await c.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO app_user`);
  await c.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app_user`);
  await c.end();
}

// 2. Apply drizzle migrations against the test DB.
console.log("applying migrations to test db ...");
const { execSync } = await import("node:child_process");
execSync("bunx drizzle-kit migrate", {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: testUrl },
});

// 3. Apply RLS policies + triggers against the test DB.
console.log("applying rls + triggers to test db ...");
execSync("bun src/server/db/scripts/apply-sql.mjs", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testUrl },
});

// 4. Idempotent NOBYPASSRLS role for the RLS isolation suite (Plan E task E1b).
//     Runs on the vitest branch only. Password source: RLS_TEST_PASSWORD env;
//     the fallback is a test-branch-only literal, NOT a prod secret (see report).
//     Placed AFTER migrations so the explicit table GRANTs below always resolve.
console.log("ensuring rls_test_user role (NOBYPASSRLS) ...");
const RLS_TEST_ROLE = "rls_test_user";
const RLS_TEST_PASSWORD =
  process.env.RLS_TEST_PASSWORD ?? "RlsT3st!Local-Only-2026-vitEST";
{
  const c = new Client({ connectionString: testUrl });
  await c.connect();
  const escPwd = RLS_TEST_PASSWORD.replaceAll("'", "''");
  await c.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${RLS_TEST_ROLE}') THEN
        CREATE ROLE ${RLS_TEST_ROLE} NOBYPASSRLS LOGIN PASSWORD '${escPwd}';
      END IF;
    END $$;
  `);
  // Keep a pre-existing role in sync (password + no-bypass) — reruns stay green.
  await c.query(
    `ALTER ROLE ${RLS_TEST_ROLE} WITH NOBYPASSRLS LOGIN PASSWORD '${escPwd}'`,
  );
  await c.query(`GRANT CONNECT ON DATABASE "${TEST_DB}" TO ${RLS_TEST_ROLE}`);
  await c.query(`GRANT USAGE ON SCHEMA public TO ${RLS_TEST_ROLE}`);
  // Tenant tables — verbatim list from docs/runbook-app-user.md (mirror of rls.sql).
  await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON
    memberships, accounts, fiscal_periods,
    journal_entries, journal_lines, journal_seq_counters, audit_log,
    documents, ai_drafts, journal_documents,
    tenant_chunks, chat_threads, onboarding_messages, org_profiles,
    ai_findings, ai_proposals,
    contacts, invoices, bank_reconciliations, kas_bank_entries,
    kas_bank_seq_counters,
    fixed_assets, asset_depreciation_lines, asset_disposals,
    prepaid_contracts, prepaid_schedule_lines,
    inventory_settings, inventory_items, inventory_layers,
    inventory_transactions, stock_opnames, inventory_sku_counters,
    pos_shifts, pos_sales, pos_sale_items, pos_sale_seq_counters,
    invoice_seq_counters, ast_seq_counters,
    subledger_controls, subledger_journal_links,
    tax_summaries, assistant_memories
  TO ${RLS_TEST_ROLE}`);
  // Child tables isolated via their parents.
  await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON
    invoice_items, invoice_payments,
    bank_statement_lines,
    chat_messages,
    stock_opname_items,
    organizations
  TO ${RLS_TEST_ROLE}`);
  // Catch-all for any table the explicit list missed + sequences.
  await c.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${RLS_TEST_ROLE}`,
  );
  await c.query(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${RLS_TEST_ROLE}`,
  );
  await c.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${RLS_TEST_ROLE}`,
  );
  await c.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${RLS_TEST_ROLE}`,
  );
  const chk = await c.query(
    `SELECT rolbypassrls FROM pg_roles WHERE rolname = '${RLS_TEST_ROLE}'`,
  );
  if (chk.rows[0]?.rolbypassrls !== false) {
    await c.end();
    throw new Error(
      `SAFETY: role ${RLS_TEST_ROLE} has BYPASSRLS — refusing RLS suite setup`,
    );
  }
  console.log(`role ${RLS_TEST_ROLE} ready (NOBYPASSRLS, grants applied)`);
  await c.end();
}

console.log(`test db ready: ${testUrl}`);
