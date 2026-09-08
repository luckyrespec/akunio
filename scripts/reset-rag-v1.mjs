// Migrasi satu-kali ruang vektor embedding v2 -> v1 (gemini-embedding-001).
// - tenant_chunks: dikosongkan (diisi ulang otomatis oleh cron rag-drain).
// - ifrs_chunks non-SAK (fixture IFRS): dihapus, lalu tanam ulang via
//   `bun scripts/seed-ifrs.ts` (script seed skip bila tabel terisi).
// - Baris SAK-EMKM-% TIDAK disentuh di sini; ditanam ulang via
//   `bun scripts/ingest-sak-gemini.ts` (membersihkan miliknya sendiri).
// Target DB = DATABASE_URL dari .env (dev Neon). Read-only kecuali 2
// statement di bawah; tidak menyentuh tabel bisnis.
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (t) => pool.query(`SELECT count(*)::int AS n FROM ${t}`).then((r) => r.rows[0].n);

console.log("sebelum:", {
  tenant_chunks: await q("tenant_chunks"),
  ifrs_chunks: await q("ifrs_chunks"),
});

await pool.query(`TRUNCATE tenant_chunks`);
const del = await pool.query(`DELETE FROM ifrs_chunks WHERE section NOT LIKE 'SAK-EMKM-%'`);
console.log(`dihapus ${del.rowCount} baris ifrs_chunks non-SAK`);

console.log("sesudah:", {
  tenant_chunks: await q("tenant_chunks"),
  ifrs_chunks: await q("ifrs_chunks"),
});
await pool.end();
console.log("ok — lanjut: bun scripts/seed-ifrs.ts && bun scripts/ingest-sak-gemini.ts");
