/**
 * Backup & restore data RAG SAK EMKM (`sak_sources` + `ifrs_chunks`).
 *
 * Mengapa bukan pg_dump: environment dev tidak selalu punya binary
 * PostgreSQL, dan cara ini bekerja identik ke Neon maupun Postgres lokal.
 * `tenant_chunks` (data RAG per-org, runtime) sengaja TIDAK ikut — itu
 * data organisasi, bukan pengetahuan SAK.
 *
 * Pakai:
 *   export:  bun scripts/export-rag-sak.mjs
 *            → backups/rag-sak-emkm-<timestamp>.json
 *   import:  bun scripts/export-rag-sak.mjs --import backups/rag-sak-emkm-<file>.json
 *            (idempoten: ON CONFLICT (id) DO NOTHING)
 *
 * Koneksi: DATABASE_URL dari .env (dev = Neon). Jangan arahkan ke
 * ledger_test kecuali memang mau restore ke sana.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { Client } from "pg";

const TABLES = ["sak_sources", "ifrs_chunks"];

function loadEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function exportBackup() {
  loadEnv();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const data = { exportedAt: new Date().toISOString(), tables: {} };
  for (const table of TABLES) {
    // embedding dinormalisasi ke teks agar format stabil baik di kolom
    // vector asli (pgvector) maupun fallback text (tanpa pgvector).
    const cols = table === "sak_sources"
      ? "id, doc_id, version, effective_date, created_at"
      : "id, section, chunk_index, content, embedding::text AS embedding, tsv::text AS tsv, created_at";
    const res = await client.query(`SELECT ${cols} FROM ${table} ORDER BY 1`);
    data.tables[table] = res.rows;
    console.log(`${table}: ${res.rowCount} baris`);
  }
  await client.end();
  mkdirSync("backups", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const path = `backups/rag-sak-emkm-${stamp}.json`;
  writeFileSync(path, JSON.stringify(data));
  console.log(`tersimpan: ${path}`);
}

async function importBackup(path) {
  loadEnv();
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (!data.tables?.sak_sources || !data.tables?.ifrs_chunks) {
    throw new Error("Format backup tidak dikenal (harus hasil export-rag-sak.mjs).");
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // Deteksi tipe kolom embedding target: vector asli vs fallback text.
    const { rows: [col] } = await client.query(
      `SELECT udt_name FROM information_schema.columns
       WHERE table_name = 'ifrs_chunks' AND column_name = 'embedding'`
    );
    const embCast = col?.udt_name === "vector" ? "::vector" : "";
    const tsvCast = "::tsvector";
    await client.query("BEGIN");
    for (const r of data.tables.sak_sources) {
      await client.query(
        `INSERT INTO sak_sources (id, doc_id, version, effective_date, created_at)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
        [r.id, r.doc_id, r.version, r.effective_date, r.created_at]
      );
    }
    let n = 0;
    for (const r of data.tables.ifrs_chunks) {
      await client.query(
        `INSERT INTO ifrs_chunks (id, section, chunk_index, content, embedding, tsv, created_at)
         VALUES ($1,$2,$3,$4,$5${embCast},$6${tsvCast},$7) ON CONFLICT (id) DO NOTHING`,
        [r.id, r.section, r.chunk_index, r.content, r.embedding, r.tsv, r.created_at]
      );
      n++;
    }
    await client.query("COMMIT");
    console.log(`restore selesai: ${data.tables.sak_sources.length} sak_sources, ${n} ifrs_chunks (baris lama dilewati).`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    await client.end();
  }
}

const importIdx = process.argv.indexOf("--import");
if (importIdx >= 0 && process.argv[importIdx + 1]) {
  await importBackup(process.argv[importIdx + 1]);
} else {
  await exportBackup();
}
