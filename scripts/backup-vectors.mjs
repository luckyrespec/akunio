// Backup vektor RAG global (ifrs_chunks + sak_sources) ke JSON berversi.
// DB sumber: --db=<conn> | TARGET_DATABASE_URL | DATABASE_URL (.env).
// Output: src/server/db/seeds/ifrs_chunks_v1.json — embed sekali, restore
// di DB mana pun tanpa panggil API Gemini lagi.
// Usage: bun scripts/backup-vectors.mjs [--db=<conn>] [--out=<path>]
import { writeFileSync, mkdirSync } from "node:fs";
import pg from "pg";
import { embedModel } from "@/server/ai/models";

const arg = (n) => {
  const p = process.argv.find((a) => a.startsWith(`--${n}=`));
  return p ? p.slice(n.length + 3) : undefined;
};
const conn = arg("db") ?? process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL;
if (!conn) {
  console.error("ERROR: sediakan --db / TARGET_DATABASE_URL / DATABASE_URL");
  process.exit(1);
}
const out = arg("out") ?? new URL("../src/server/db/seeds/ifrs_chunks_v1.json", import.meta.url);

const pool = new pg.Pool({ connectionString: conn });
const chunks = await pool.query(
  `SELECT section, chunk_index, content, embedding FROM ifrs_chunks ORDER BY section, chunk_index`,
);
const sources = await pool.query(`SELECT doc_id, version, effective_date FROM sak_sources ORDER BY doc_id`);
await pool.end();

const data = {
  meta: {
    model: embedModel(),
    dims: 768,
    exportedAt: new Date().toISOString(),
    note: "Restore via bun scripts/restore-vectors.mjs (tanpa re-embed).",
  },
  ifrs_chunks: chunks.rows,
  sak_sources: sources.rows,
};
mkdirSync(new URL(".", out), { recursive: true });
writeFileSync(out, JSON.stringify(data));
const mb = (Buffer.byteLength(JSON.stringify(data)) / 1024 / 1024).toFixed(2);
console.log(`backup: ${chunks.rowCount} chunks + ${sources.rowCount} sources -> ${out} (${mb} MB)`);
