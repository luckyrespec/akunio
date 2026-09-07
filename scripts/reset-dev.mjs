// Reset database DEV (Neon) ke kondisi kosong tanpa menyentuh vektor global.
// Aman: menolak DB test, menolak tanpa CONFIRM_DEV_RESET=1, mempertahankan
// ifrs_chunks + sak_sources (backup: bun run db:vectors:backup).
// Jalankan: CONFIRM_DEV_RESET=1 bun scripts/reset-dev.mjs
import { readFileSync, existsSync } from "node:fs";
import { Client } from "pg";

function loadEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL wajib ada di .env");
  process.exit(1);
}
if (/ledger_test/i.test(url)) {
  console.error("SAFETY: menolak reset database test (ledger_test).");
  process.exit(1);
}
if (!process.argv.includes("--confirm")) {
  console.error("Jalankan dengan flag --confirm untuk reset dev: bun scripts/reset-dev.mjs --confirm");
  process.exit(1);
}

// Vektor RAG global — tidak boleh ikut ter-reset (punya backup di
// src/server/db/seeds/ifrs_chunks_v1.json via bun run db:vectors:backup).
const PRESERVE = ["ifrs_chunks", "sak_sources"];

const c = new Client({ connectionString: url });
await c.connect();

const before = await c.query(
  `SELECT (SELECT count(*)::int FROM ifrs_chunks) AS ifrs,
          (SELECT count(*)::int FROM sak_sources) AS sak,
          (SELECT count(*)::int FROM organizations) AS orgs`,
);
console.log("sebelum:", JSON.stringify(before.rows[0]));

const tables = await c.query(
  `SELECT tablename FROM pg_tables
   WHERE schemaname = 'public' AND tablename <> ALL ($1)
     AND tablename NOT LIKE '%migration%'`,
  [PRESERVE],
);
const names = tables.rows.map((r) => `"${r.tablename}"`);
console.log(`truncate ${names.length} tabel (preserve: ${PRESERVE.join(", ")}) ...`);
await c.query(`TRUNCATE ${names.join(", ")} CASCADE`);

const after = await c.query(
  `SELECT (SELECT count(*)::int FROM ifrs_chunks) AS ifrs,
          (SELECT count(*)::int FROM sak_sources) AS sak,
          (SELECT count(*)::int FROM organizations) AS orgs`,
);
console.log("sesudah:", JSON.stringify(after.rows[0]));

if (after.rows[0].ifrs !== before.rows[0].ifrs || after.rows[0].sak !== before.rows[0].sak) {
  console.error("SAFETY: jumlah vektor berubah — restore via bun run db:vectors:restore");
  process.exit(1);
}
await c.end();
console.log("reset dev selesai.");
