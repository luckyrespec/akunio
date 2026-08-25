# Design: Migrasi npm/Node → Bun (Full Runtime)

Tanggal: 2026-08-25
Status: Disetujui (desain), menunggu review spec
Scope: Tooling saja — nol perubahan kode aplikasi (`src/`)

## Tujuan

Memindahkan tooling project dari npm ke Bun sepenuhnya:

- **Bun sebagai package manager** (`bun install`, lockfile `bun.lock`)
- **Bun sebagai runtime** untuk proses aplikasi (`next dev/build/start` via `bun --bun`)
- **Bun sebagai launcher** untuk script-tooling (vitest, playwright, drizzle-kit)

Definisi "tidak ada break": semua gerbang verifikasi S0–S5 hijau (lihat bawah)
sebelum migrasi dinyatakan sukses.

## Fakta Pengunci Desain

1. `bun run dev` **saja tidak cukup** untuk full runtime — binari `next`
   punya shebang `#!/usr/bin/env node`, jadi tetap dieksekusi Node. Full
   runtime memerlukan prefix `--bun` di dalam definisi script:
   `"dev": "bun --bun next dev"`.
2. Dokumen Next 16.3 bundled (`node_modules/next/dist/docs/`) memperlakukan
   Bun sebagai first-class package manager; tidak ada deprekasi yang
   menghalangi.
3. Kandidat bloker utama adalah **vitest di Bun runtime** — worker pool
   (tinypool) sensitif terhadap runtime non-Node. Fallback eksplisit sudah
   disiapkan (S3).

## Bagian 1 — Installasi & Konversi Dependensi

### Install Bun (Windows, official installer)

```powershell
powershell -c "irm bun.sh/install.ps1|iex"
```

- Verifikasi: `bun --version` dan `bun --revision`.
- Jika `bun --version` tidak dikenali setelah install → tambahkan
  `$env:USERPROFILE\.bun\bin` ke PATH user lalu restart terminal.
- **Node v24 TIDAK dihapus** — tetap dibutuhkan oleh eslint/tsc/tooling yang
  sengaja dibiarkan berjalan via Node.

### Konversi lockfile

1. Buat git tag `pre-bun-migration` (titik rollback).
2. Hapus `node_modules/` dan `package-lock.json` (dapat dipulihkan dari git
   history).
3. Jalankan `bun install` → menghasilkan `bun.lock`.
4. Commit `bun.lock`. `.gitignore` tidak perlu diubah (node_modules sudah
   di-ignore; `bun.lock` harus ter-commit).
5. Catatan: Bun memblokir postinstall dependensi tak-tepercaya secara
   default. Dependensi project ini (pure-JS + native binary resmi:
   tailwindcss oxide, playwright) tidak bergantung pada postinstall. Warning
   postinstall saat `bun install` ditangani kasus per kasus.

## Bagian 2 — Perubahan Scripts, Config & Docs

### package.json scripts

| Script | Lama | Baru | Runtime |
|---|---|---|---|
| `dev` | `next dev` | `bun --bun next dev` | Bun |
| `build` | `next build` | `bun --bun next build` | Bun |
| `start` | `next start` | `bun --bun next start` | Bun |
| `lint` | `eslint` | tidak berubah | Node |
| `test` | `vitest run` | spike dulu — lihat S3 | Bun / Node |
| `e2e` | `playwright test` | tidak berubah | launcher |
| `test:db:setup` | `node scripts/test-db-setup.mjs` | `bun scripts/test-db-setup.mjs` | Bun |
| `db:sql` | `node src/server/db/scripts/apply-sql.mjs` | `bun src/server/db/scripts/apply-sql.mjs` | Bun |
| `weed:dev`, `db:up`, `db:migrate` | — | tidak berubah | cmd / drizzle-kit |

Prefix `--bun` ditaruh di dalam script (bukan di invocation) agar hasil
runtime konsisten walau dipanggil lewat `bun run`, `npm run`, atau langsung.

### File lain yang diubah

1. `playwright.config.ts` baris 8 — webServer `command: "npm run dev"` →
   `"bun run dev"` (menjalankan script yang sudah memuat `--bun`).
2. `scripts/test-db-setup.mjs` baris 84 — `execSync("node src/...")` →
   `execSync("bun src/...")`.
3. `tests/integration/helpers.ts` baris 7 — pesan error
   `Run "npm run test:db:setup"` → `Run "bun run test:db:setup"` (kosmetik).
4. `README.md` — semua perintah `npm`→`bun`; prasyarat "Node 20+" →
   "Bun 1.3+ (Node tetap terinstall untuk tooling)".
5. `AGENTS.md` — blok Commands diperbarui ke `bun run ...`;
   `npx tsc --noEmit` tetap (tsc via Node launcher).

### Yang TIDAK disentuh

- Seluruh kode `src/` dan konfigurasi aplikasi (`next.config.ts`,
  `drizzle.config.ts`, `docker-compose.yml`, `.env*`, SQL trigger/RLS).
- Docker compose, database native Postgres 18, SeaweedFS.
- Node.js installation global.

## Bagian 3 — Protokol Spike, Fallback & Rollback

### Urutan eksekusi (tiap langkah = gate)

| # | Aksi | Gate hijau |
|---|---|---|
| S0 | `bun install` | `bun.lock` terbentuk, tanpa error |
| S1 | `bun run dev` (Bun runtime) | server boot + GET `/` merespons HTTP 2xx/3xx tanpa error runtime di log |
| S2 | `bun run build` | build selesai tanpa error |
| S3 | spike `bun --bun vitest run` | suite lolos penuh di `ledger_test` |
| S4 | `npx tsc --noEmit` | bersih |
| S5 | `bun run e2e` (DB + SeaweedFS jalan, AI_MOCK=1) | semua skenario lolos |

Prasyarat S3/S5: Postgres lokal + SeaweedFS berjalan; `bun run
test:db:setup` sudah dijalankan untuk `ledger_test`.

### Aturan fallback (menjamin "tidak ada break")

- **S3 gagal:** satu kali percobaan fix targeted (mis. env var khusus Bun /
  config pool). Masih gagal → `test` tetap `"vitest run"` (worker Node,
  diluncurkan `bun run test`) dan dicatat sebagai pengecualian sadar di
  AGENTS.md. Test tetap hijau; hanya engine worker yang Node.
- **S1/S2 gagal permanen** (core app rusak di Bun Windows): seluruh migrasi
  turun ke pendekatan C — Bun sebagai PM+runner saja (`bun install`,
  scripts tanpa `--bun`). Semua gerbang wajib tetap lolos sebelum
  dinyatakan sukses.
- Setiap spike maksimal satu percobaan fix targeted sebelum fallback;
  keputusan fallback dicatat di commit message / AGENTS.md.

### Rollback

- Total kapan pun: `git revert <commit-migrasi>` +
  `git checkout pre-bun-migration -- package-lock.json` → kembali ke npm
  100%.
- Granular: revert satu baris script = permukaan tunggal kembali ke Node.

## Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| vitest/tinypool di Bun runtime | test gagal jalan | fallback worker Node (S3), tetap hijau |
| Turbopack + Bun runtime di Windows | dev/build gagal | spike S1/S2 lebih dulu; fallback PM-only (pendekatan C) |
| pg / better-auth / @google/genai di Bun runtime | error runtime halaman | tercakup S1 (login page) dan S5 (e2e penuh) |
| Postinstall diblokir Bun | dependency rusak | cek warning S0; semua dep project aman |
| Lockfile drift vs package-lock lama | versi beda diam-diam | `bun install` resolusi dari range package.json; diff bun.lock direview saat commit |

## Definisi Sukses

Semua gerbang S0–S5 hijau dengan runtime sesuai tabel Bagian 2, docs
(README/AGENTS.md) konsisten dengan perintah baru, dan `git diff` migrasi
tidak menyentuh `src/`.
