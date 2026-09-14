# Runbook: Reset Dev (`scripts/reset-dev.mjs`)

Reset database DEV (Neon, branch main) ke kondisi kosong tanpa menghapus
pengetahuan RAG global dan tanpa menghapus user uji + org-nya.

## Yang dipertahankan

- RAG global: `ifrs_chunks` + `sak_sources` (dikecualikan dari TRUNCATE).
- User uji + org-nya: baris `organizations` / `memberships` / `org_profiles` /
  `"user"` milik email preserve (default `kerjaanlucky@gmail.com`).
  - Tabel user-mirror aktual adalah **`"user"`** (public, read-only mirror
    id/email/name — lihat `src/server/db/schema/auth.ts`). Dikutip karena
    `USER` kata cadangan.
  - Urutan restore mengikuti FK: org → user/mirror → membership → profile.
  - Email tak ditemukan = **warning** (stderr), bukan gagal — user mungkin
    dibuat nanti.

## Urutan aman

1. **Backup RAG terbaru** (wajib, sebelum apa pun):
   `bun scripts/export-rag-sak.mjs` → `backups/rag-sak-emkm-<ts>.json`.
2. **Jalankan reset** (default preserve user uji):
   `bun scripts/reset-dev.mjs --confirm`
   - Flag: `--preserve-user=<email>` (default `kerjaanlucky@gmail.com`),
     `--db=<conn>` (default `DATABASE_URL` dari `.env`).
   - Skrip menolak DB `ledger_test` kecuali `--allow-test` eksplisit
     (khusus dry-run, lihat bawah), dan menolak jalan tanpa `--confirm`.
   - Sebelum TRUNCATE: dump preserve ke `backups/preserve-<ts>.json`.
3. **Verifikasi** (skrip sudah otomatis, pastikan semua OK):
   - `verifikasi "user"/"organizations"/"memberships"/"org_profiles"` cocok
     dengan dump, kalau tidak skrip exit 1.
   - Count `ifrs_chunks`/`sak_sources` sebelum == sesudah; bila berubah,
     skrip otomatis restore dari `backups/rag-sak-emkm-<latest>.json`
     (insert idempoten), lalu hitung ulang — masih beda = exit 1.
   - Manual: login sebagai user uji, buka dasbor, pastikan org-nya ada.
4. **Rollback**: bila verifikasi gagal,
   `bun scripts/export-rag-sak.mjs --import backups/rag-sak-emkm-<file>.json`
   untuk RAG, dan restore baris preserve dari `backups/preserve-<ts>.json`.

## Peringatan

- **JANGAN** `rm -rf` data weed (`D:\Lucky\weed_strorage\data`) — itu koleksi
  SeaweedFS asli, bukan bagian reset DB.
- **JANGAN** reset tanpa backup RAG terbaru (langkah 1).
- **JANGAN** arahkan reset ke dev untuk latihan — dry-run HANYA di TEST.

## Dry-run E4 (pilihan (a): database TEST, 2026-09-14)

Docker tak ada di mesin ini; cabang Neon sekali-pakai butuh id. Dipilih uji
terhadap `ledger_test` (cabang vitest, sekali-pakai) dengan user dummy
`e4-dryrun-dummy@example.com` (diverifikasi beda dari `kerjaanlucky@gmail.com`
sebelum jalan), via `node.exe` (tanpa autoload `.env` ala bun) + `--allow-test`:

- `node.exe scripts/reset-dev.mjs --confirm --allow-test --db=<TEST_URL>
  --preserve-user=e4-dryrun-dummy@example.com`
- Hasil **PASS**: `preserve … user=1 orgs=1 memberships=1 profiles=1`,
  verifikasi keempat tabel OK, `sesudah: {ifrs:7, sak:0, orgs:1}` cocok dengan
  sebelum; verifikasi independen (query langsung) `u=1 o=1 m=1 p=1` + RAG cocok.
- Jalur email-tak-ada: `--preserve-user=tidak-ada@example.com` → warning di
  stderr, exit 0, RAG tetap `{ifrs:7, sak:0}`.
- Cleanup: baris dummy + `backups/preserve-<ts>.json` artefak dihapus; TEST
  kembali kosong selain RAG (suite vitest me-TRUNCATE tiap run).
