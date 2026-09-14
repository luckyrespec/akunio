// Reset database DEV (Neon) ke kondisi kosong tanpa menyentuh vektor global
// dan tanpa menghapus user uji + org-nya.
// Aman: menolak DB test kecuali --allow-test eksplisit (dry-run), menolak
// tanpa --confirm, mempertahankan ifrs_chunks + sak_sources (TRUNCATE
// mengecualikan keduanya; bila count berubah, restore otomatis dari
// backups/rag-sak-emkm-<latest>.json via bun scripts/export-rag-sak.mjs).
// Preserve user: sebelum TRUNCATE, baris organizations/memberships/
// org_profiles/"user" milik email didump ke backups/preserve-<ts>.json,
// lalu direstore berurutan (org -> user -> membership -> profile) + verifikasi
// count. Email tak ditemukan = warning, bukan gagal.
// Jalankan: bun scripts/reset-dev.mjs --confirm [--preserve-user=<email>]
// Dry-run di TEST (DILARANG menyentuh dev untuk latihan):
//   node.exe scripts/reset-dev.mjs --confirm --allow-test --db=<TEST_URL> --preserve-user=<dummy>
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { Client } from "pg";

function loadEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const arg = (n) => {
  const p = process.argv.find((a) => a.startsWith(`--${n}=`));
  return p ? p.slice(n.length + 3) : undefined;
};

// Tabel user-mirror aktual adalah "user" (public, read-only mirror id/email/name
// untuk join member-list; lihat src/server/db/schema/auth.ts). Dikutip karena
// USER kata cadangan. Urutan restore mengikuti FK: organizations tidak punya
// parent; memberships.org_id -> organizations; "user".id tanpa FK; kolom
// memberships.user_id teks polos (tanpa FK); org_profiles.org_id -> organizations.
const PRESERVE_EMAIL = arg("preserve-user") ?? "kerjaanlucky@gmail.com";
const url = arg("db") ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL wajib ada di .env (atau --db=<conn>)");
  process.exit(1);
}
if (/ledger_test/i.test(url) && !process.argv.includes("--allow-test")) {
  console.error("SAFETY: menolak reset database test (ledger_test) tanpa --allow-test eksplisit.");
  process.exit(1);
}
if (!process.argv.includes("--confirm")) {
  console.error("Jalankan dengan flag --confirm untuk reset dev: bun scripts/reset-dev.mjs --confirm");
  process.exit(1);
}

// Vektor RAG global — tidak boleh ikut ter-reset (punya backup di
// src/server/db/seeds/ifrs_chunks_v1.json via bun run db:vectors:backup,
// plus backups/rag-sak-emkm-*.json via scripts/export-rag-sak.mjs).
const PRESERVE = ["ifrs_chunks", "sak_sources"];

const c = new Client({ connectionString: url });
await c.connect();

async function ragCounts(client) {
  const r = await client.query(
    `SELECT (SELECT count(*)::int FROM ifrs_chunks) AS ifrs,
            (SELECT count(*)::int FROM sak_sources) AS sak,
            (SELECT count(*)::int FROM organizations) AS orgs`,
  );
  return r.rows[0];
}

async function dumpPreserve(client, email) {
  const u = await client.query(`SELECT * FROM "user" WHERE email = $1`, [email]);
  if (u.rowCount === 0) {
    console.warn(`WARNING: preserve-user ${email} tidak ditemukan — lanjut tanpa preserve (user mungkin dibuat nanti).`);
    return null;
  }
  const userId = u.rows[0].id;
  const m = await client.query(`SELECT * FROM memberships WHERE user_id = $1`, [userId]);
  const orgIds = [...new Set(m.rows.map((r) => r.org_id))];
  const orgs = orgIds.length > 0
    ? (await client.query(`SELECT * FROM organizations WHERE id = ANY($1)`, [orgIds])).rows
    : [];
  const profiles = orgIds.length > 0
    ? (await client.query(`SELECT * FROM org_profiles WHERE org_id = ANY($1)`, [orgIds])).rows
    : [];
  const data = {
    email,
    exportedAt: new Date().toISOString(),
    user: u.rows,
    organizations: orgs,
    memberships: m.rows,
    org_profiles: profiles,
  };
  mkdirSync("backups", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const path = `backups/preserve-${stamp}.json`;
  writeFileSync(path, JSON.stringify(data));
  console.log(
    `preserve ${email}: user=${u.rowCount} orgs=${orgs.length} memberships=${m.rowCount} profiles=${profiles.length} -> ${path}`,
  );
  return { path, data };
}

async function insertRows(client, table, rows) {
  for (const row of rows) {
    const cols = Object.keys(row);
    const vals = Object.values(row).map((v) =>
      v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v,
    );
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
    await client.query(
      `INSERT INTO ${table} (${cols.map((k) => `"${k}"`).join(",")}) VALUES (${placeholders})`,
      vals,
    );
  }
}

async function restorePreserve(client, dump) {
  // Urutan FK: org -> user/mirror -> membership -> profile.
  await insertRows(client, `"organizations"`, dump.organizations);
  await insertRows(client, `"user"`, dump.user);
  await insertRows(client, `"memberships"`, dump.memberships);
  await insertRows(client, `"org_profiles"`, dump.org_profiles);
  const checks = [
    ['"user"', "email", dump.email, dump.user.length],
    ['"organizations"', null, null, dump.organizations.length],
    ['"memberships"', "user_id", dump.user[0].id, dump.memberships.length],
    ['"org_profiles"', null, null, dump.org_profiles.length],
  ];
  for (const [table, col, val, expected] of checks) {
    const r = col
      ? await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE "${col}" = $1`, [val])
      : await client.query(`SELECT count(*)::int AS n FROM ${table}`);
    // Setelah TRUNCATE tabel kosong, jadi count global == jumlah dump.
    const ok = r.rows[0].n === expected;
    console.log(`verifikasi ${table}: ${r.rows[0].n} (dump ${expected}) ${ok ? "OK" : "GAGAL"}`);
    if (!ok) {
      console.error(`SAFETY: restore preserve ${table} tidak cocok — rollback manual dari ${dump.path ?? "backup"}.`);
      process.exit(1);
    }
  }
}

async function restoreRagFromLatestBackup(client) {
  const files = existsSync("backups")
    ? readdirSync("backups").filter((f) => f.startsWith("rag-sak-emkm-") && f.endsWith(".json")).sort()
    : [];
  if (files.length === 0) {
    console.error("SAFETY: jumlah vektor berubah dan tidak ada backups/rag-sak-emkm-*.json — restore manual via bun scripts/export-rag-sak.mjs --import <file>");
    process.exit(1);
  }
  const latest = `backups/${files[files.length - 1]}`;
  console.log(`RAG berubah — restore otomatis dari ${latest} ...`);
  const data = JSON.parse(readFileSync(latest, "utf8"));
  const { rows: [col] } = await client.query(
    `SELECT udt_name FROM information_schema.columns
     WHERE table_name = 'ifrs_chunks' AND column_name = 'embedding'`,
  );
  const embCast = col?.udt_name === "vector" ? "::vector" : "";
  await client.query("BEGIN");
  try {
    for (const r of data.tables.sak_sources) {
      await client.query(
        `INSERT INTO sak_sources (id, doc_id, version, effective_date, created_at)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
        [r.id, r.doc_id, r.version, r.effective_date, r.created_at],
      );
    }
    for (const r of data.tables.ifrs_chunks) {
      await client.query(
        `INSERT INTO ifrs_chunks (id, section, chunk_index, content, embedding, tsv, created_at)
         VALUES ($1,$2,$3,$4,$5${embCast},$6::tsvector,$7) ON CONFLICT (id) DO NOTHING`,
        [r.id, r.section, r.chunk_index, r.content, r.embedding, r.tsv, r.created_at],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
  console.log(`restore RAG selesai dari ${latest}.`);
}

const before = await ragCounts(c);
console.log("sebelum:", JSON.stringify(before));

const dump = await dumpPreserve(c, PRESERVE_EMAIL);

const tables = await c.query(
  `SELECT tablename FROM pg_tables
   WHERE schemaname = 'public' AND tablename <> ALL ($1)
     AND tablename NOT LIKE '%migration%'`,
  [PRESERVE],
);
const names = tables.rows.map((r) => `"${r.tablename}"`);
console.log(`truncate ${names.length} tabel (preserve: ${PRESERVE.join(", ")}) ...`);
await c.query(`TRUNCATE ${names.join(", ")} CASCADE`);

if (dump) await restorePreserve(c, dump.data);

const after = await ragCounts(c);
console.log("sesudah:", JSON.stringify(after));

if (after.ifrs !== before.ifrs || after.sak !== before.sak) {
  await restoreRagFromLatestBackup(c);
  const fixed = await ragCounts(c);
  console.log("sesudah-restore-RAG:", JSON.stringify(fixed));
  if (fixed.ifrs !== before.ifrs || fixed.sak !== before.sak) {
    console.error("SAFETY: jumlah vektor masih berubah setelah restore — restore manual via bun run db:vectors:restore");
    process.exit(1);
  }
}
await c.end();
console.log("reset dev selesai.");
