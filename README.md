# Neraca — AI Accounting SaaS (M1: Ledger-first)

Pembukuan berbasis IFRS untuk SME dengan antarmuka Paper & Ink.
Milestone ini mengirimkan inti pembukuan; AI menyusul di M2–M4.

## Menjalankan Lokal (Windows PowerShell)

Prasyarat: Bun 1.3+ (Node tetap terinstall untuk tooling eslint/tsc), lalu salah satu jalur basis data di bawah.

1. `bun install`
2. `Copy-Item .env.example .env` — sesuaikan dengan jalur yang dipilih.

### Jalur A — Docker (portabel)

Postgres 16 + pgvector di port `54329` (pgvector baru dibutuhkan mulai M3).

```powershell
bun run db:up
```

Skrip init Docker (`docker/init/01-role.sql`) otomatis membuat peran
`app_user`. Sesuaikan `.env` ke port dan kata sandi Docker:

```
DATABASE_URL="postgres://postgres:postgres@127.0.0.1:54329/ledger"
APP_DATABASE_URL="postgres://app_user:app_pw@127.0.0.1:54329/ledger"
```

### Jalur B — Postgres native (sudah terpasang)

Mesin ini memakai PostgreSQL 18 native di `127.0.0.1:5432` (nilai bawaan
`.env.example`). Pastikan layanan berjalan:

```powershell
Get-Service postgresql*
Start-Service postgresql-x64-18   # sesuaikan nama layanan
```

Lalu buat basis data, peran runtime, dan grant-nya:

```powershell
psql -U postgres
```

```sql
CREATE DATABASE ledger;
\c ledger
CREATE ROLE app_user LOGIN PASSWORD 'app_pw';
GRANT ALL ON SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO app_user;
\q
```

### Lanjutan (kedua jalur sama)

3. `bunx drizzle-kit migrate` — skema.
4. `bun run db:sql` — RLS policies + immutability triggers.
5. `bun run dev` → http://localhost:3000 (daftar → organisasi, bagan akun,
   dan 12 periode dibuat otomatis).

## Pengujian

- `bun run test` — unit (core) + integration (butuh DB dari Jalur A/B).
- `SKIP_DB_TESTS=1 bun run test` — hanya unit.
- `bun run e2e` — Playwright smoke 3 skenario (dev server otomatis).

## Urutan Skema

Skema bisnis ada di `src/server/db/schema/*.ts`; tabel auth di
`schema/auth.ts`. Trigger imutabilitas dan RLS ada di
`src/server/db/{triggers,rls}.sql`, diterapkan lewat `bun run db:sql`.

## Status Milestone Ini

M1 (Ledger-first) mengirimkan:

- Auth + bootstrap organisasi otomatis (bagan akun + 12 periode saat daftar).
- Bagan akun (COA) bawaan dengan arsip akun.
- Jurnal manual dengan validasi keseimbangan, posting imutabel (trigger),
  dan pembalikan (reversal) tertaut.
- Periode tutup/buka terkendali peran.
- Jejak audit berantai hash (`appendAudit` + `verifyChain`).
- Row-Level Security per organisasi.
- Empat laporan IFRS-SME: Neraca, Laba Rugi, Perubahan Ekuitas, Arus Kas
  (metode tidak langsung), plus Buku Besar per akun.
- Dasbor ringkasan, halaman Pengaturan, UI Paper & Ink dalam Bahasa Indonesia.

Berikutnya: **M2 Copilot** · **M3 Advisor RAG** · **M4 Doctor**.

## Checklist Sebelum Produksi

- [ ] PENTING: beralih ke peran non-superuser (`app_user`) BUKAN sekadar ganti
      konfigurasi. Dengan `FORCE ROW LEVEL SECURITY` dan GUC `app.current_org`
      yang tidak disetel, semua query mengembalikan nol baris dan INSERT gagal.
      Prasyarat kodenya: SEMUA pemanggilan server tenant-scoped harus dirutekan
      lewat `withOrg()` (atau pembungkus penyetel GUC setara) agar
      `app.current_org` terisi per transaksi — lihat
      `src/server/db/repos/with-org.ts`. Sampai refactor tersebut selesai,
      RLS hanya berfungsi sebagai defense-in-depth saat pengembangan (runtime
      superuser melewati RLS); isolasi antar-organisasi dijamin oleh scoping
      `orgId` di lapisan aplikasi.
- [ ] Verifikasi grant `app_user` mencakup SEMUA tabel bisnis, termasuk hasil
      migrasi mendatang. Celah dikenal: `ALTER DEFAULT PRIVILEGES` hanya berlaku
      untuk objek yang dibuat oleh peran yang menjalankannya — jika migrasi
      dijalankan oleh peran admin lain, grant bisa tertinggal.
- [ ] Ganti `BETTER_AUTH_SECRET` dengan nilai acak kuat (pertimbangkan juga
      menyetel `BETTER_AUTH_URL` ke domain produksi).
- [ ] `.env.example` hanya memuat placeholder — jangan pernah menyimpan
      kredensial asli di repositori.
- [ ] Backup terjadwal + verifikasi rantai audit (`verifyChain`).

## Peta Milestone

- M1 Ledger-first (ini) · M2 Copilot · M3 Advisor RAG · M4 Doctor.
Spesifikasi: docs/superpowers/specs/. Rencana: docs/superpowers/plans/.

## M2-M3 · Nara — Asisten Keuangan Terpadu

- Satu asisten `Nara` di `/asisten` (dan widget floating) — gabungan Copilot + Advisor. Natural conversation: tanya saldo/laba/IFRS, cari jurnal, lihat laporan, **buat draft jurnal via function calling** (tetap perlu review sebelum posting).
- Draft direview di `/jurnal/ai/[id]` (editable + diff + confidence) sebelum diposting lewat pipeline yang sama.
- Penyimpanan dokumen: SeaweedFS S3 — jalankan `bun run weed:dev` (butuh `weed.exe` di `D:\Lucky\weed_strorage`).
- Env AI: `GEMINI_API_KEY` (wajib, real), `GEMINI_MODEL=gemini-3.5-flash-lite`, `GEMINI_EMBED_MODEL=gemini-embedding`, `ASSISTANT_MONTHLY_LIMIT=200`, `ASSISTANT_NAME=Nara`.
- Route lama `/jurnal/ai` redirect ke `/asisten`. Model legacy Gemini (2.5/2.0/1.5) tidak didukung.
