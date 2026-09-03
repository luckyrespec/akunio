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
execSync("npx drizzle-kit migrate", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testUrl },
});

// 3. Apply RLS policies + triggers against the test DB.
console.log("applying rls + triggers to test db ...");
execSync("bun src/server/db/scripts/apply-sql.mjs", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testUrl },
});

console.log(`test db ready: ${testUrl}`);
