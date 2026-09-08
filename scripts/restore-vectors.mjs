// Restore vektor RAG global dari JSON backup — TANPA re-embed (tanpa biaya API).
// DB target: --db=<conn> | TARGET_DATABASE_URL | DATABASE_URL (.env).
// Aturan aman:
// - Abort bila ifrs_chunks target sudah terisi (kecuali --force).
// - Abort bila model backup != model env aktif (ruang vektor beda -> search
//   rusak). Override dengan --force bila paham risikonya.
// - tsv dihitung ulang dari content (identik dengan seed: to_tsvector english).
// Usage:
//   bun scripts/restore-vectors.mjs [--db=<conn>] [--file=<path>] [--force]
import { readFileSync } from "node:fs";
import pg from "pg";
import { embedModel } from "@/server/ai/models";

const args = new Set(process.argv.slice(2));
const arg = (n) => {
  const p = process.argv.find((a) => a.startsWith(`--${n}=`));
  return p ? p.slice(n.length + 3) : undefined;
};
const force = args.has("--force");
const conn = arg("db") ?? process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL;
if (!conn) {
  console.error("ERROR: sediakan --db / TARGET_DATABASE_URL / DATABASE_URL");
  process.exit(1);
}
const file = arg("file") ?? new URL("../src/server/db/seeds/ifrs_chunks_v1.json", import.meta.url);

const data = JSON.parse(readFileSync(file, "utf8"));
const activeModel = embedModel();
if (!force && data.meta?.model && data.meta.model !== activeModel) {
  console.error(
    `ABORT: backup memakai ${data.meta.model}, env aktif ${activeModel}. ` +
    `Campur ruang vektor merusak pencarian. Samakan GEMINI_EMBED_MODEL atau pakai --force.`,
  );
  process.exit(1);
}
const rows = data.ifrs_chunks ?? [];
for (const [i, r] of rows.entries()) {
  const emb = typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding;
  if (!Array.isArray(emb) || emb.length !== 768) {
    console.error(`ABORT: baris ${i} (${r.section}) bukan embedding 768 dimensi.`);
    process.exit(1);
  }
}

const pool = new pg.Pool({ connectionString: conn });
const existing = await pool.query(`SELECT count(*)::int AS n FROM ifrs_chunks`);
if (existing.rows[0].n > 0 && !force) {
  console.error(`ABORT: ifrs_chunks target sudah berisi ${existing.rows[0].n} baris. Pakai --force untuk timpa.`);
  await pool.end();
  process.exit(1);
}

await pool.query("BEGIN");
try {
  if (force) {
    await pool.query(`TRUNCATE ifrs_chunks`);
    const docIds = [...new Set((data.sak_sources ?? []).map((s) => s.doc_id))];
    if (docIds.length > 0) await pool.query(`DELETE FROM sak_sources WHERE doc_id = ANY($1)`, [docIds]);
  }
  let n = 0;
  for (const r of rows) {
    const embText = typeof r.embedding === "string" ? r.embedding : JSON.stringify(r.embedding);
    await pool.query(
      `INSERT INTO ifrs_chunks (section, chunk_index, content, embedding, tsv)
       VALUES ($1, $2, $3, $4, to_tsvector('english', $3))`,
      [r.section, String(r.chunk_index), r.content, embText],
    );
    if (++n % 100 === 0) process.stdout.write(`\r${n}/${rows.length} chunks...`);
  }
  for (const s of data.sak_sources ?? []) {
    const eff = typeof s.effective_date === "string" ? s.effective_date.slice(0, 10) : s.effective_date;
    await pool.query(
      `INSERT INTO sak_sources (doc_id, version, effective_date) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [s.doc_id, s.version, eff],
    );
  }
  await pool.query("COMMIT");
  console.log(`\nrestore: ${n} chunks + ${(data.sak_sources ?? []).length} sources (model ${data.meta?.model ?? "?"})`);
} catch (e) {
  await pool.query("ROLLBACK");
  throw e;
} finally {
  await pool.end();
}
