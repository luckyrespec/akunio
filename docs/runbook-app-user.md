# Runbook: peran database `app_user` (non-superuser, RLS berlaku)

Latar: semua role bawaan proyek Neon memiliki `BYPASSRLS`, sehingga
kebijakan RLS di `src/server/db/rls.sql` tidak berlaku bagi mereka — baik di
dev maupun prod hari ini. Runtime aplikasi (dan suite isolasi di Plan E)
harus memakai peran terpisah `app_user` yang **tanpa** `BYPASSRLS` agar
isolasi tenant `app.current_org` benar-benar ditegakkan.

Sweep `withOrg` (Task A9) menyiapkan sisi aplikasi: setiap transaksi
tenant-scoped dibungkus `withOrg(orgId, …)` dari
`src/server/db/repos/with-org.ts`, yang mengeset `app.current_org` di awal
transaksi. Tanpa peran non-bypass, bungkusan itu tidak ada efeknya — oleh
karena itu peran ini wajib ada sebelum Plan E memindahkan suite isolasi ke
pengguna non-superuser.

## 1. Buat peran via Neon Console (bukan `psql` superuser lokal)

Control plane Neon menolak password lemah (mis. `app_pw` yang dipakai contoh
lama di `scripts/test-db-setup.mjs` — buat manual dulu di Console):

1. Buka proyek di [Neon Console](https://console.neon.tech) → cabang yang
   dituju (dev: `main`/branch dev; test: cabang `vitest`).
2. Menu **Roles** → **New Role** → nama `app_user`, generate password kuat,
   simpan di password manager. **Jangan** centang hak superuser apa pun.
3. Alternatif via SQL Editor Console (sebagai owner):
   `CREATE ROLE app_user WITH LOGIN PASSWORD '<password-kuat-acak>';`

## 2. Beri GRANT minimum (tanpa BYPASSRLS)

Jalankan sebagai owner di database target. Daftar tabel di bawah disalin
verbatim dari `src/server/db/rls.sql` (array loop + tabel anak + tabel
`organizations`); jangan menebak — bila `rls.sql` bertambah tabel, ulangi
GRANT untuk tabel baru tersebut.

```sql
-- Koneksi + pemakaian skema.
GRANT CONNECT ON DATABASE neondb TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;

-- Tabel tenant langsung (kolom org_id) — persis daftar rls.sql.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  memberships, accounts, fiscal_periods,
  journal_entries, journal_lines, journal_seq_counters, audit_log,
  documents, ai_drafts, journal_documents,
  tenant_chunks, chat_threads, onboarding_messages, org_profiles,
  ai_findings, ai_proposals,
  contacts, invoices, bank_reconciliations, kas_bank_entries,
  kas_bank_seq_counters,
  fixed_assets, asset_depreciation_lines, asset_disposals,
  prepaid_contracts, prepaid_schedule_lines,
  inventory_settings, inventory_items, inventory_layers,
  inventory_transactions, stock_opnames, inventory_sku_counters,
  pos_shifts, pos_sales, pos_sale_items, pos_sale_seq_counters,
  invoice_seq_counters, ast_seq_counters,
  subledger_controls, subledger_journal_links,
  tax_summaries, assistant_memories
TO app_user;

-- Tabel anak yang diisolasi via induknya.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  invoice_items, invoice_payments,
  bank_statement_lines,
  chat_messages,
  stock_opname_items,
  organizations
TO app_user;

-- Sequence untuk penomoran (counter + serial id).
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
```

Tambahan yang **tidak** diberikan: `SUPERUSER`, `BYPASSRLS`,
`CREATEDB/CREATEROLE`, `TRUNCATE` di luar kebutuhan migrasi (migrasi tetap
jalan sebagai owner via `DATABASE_URL`).

## 3. Verifikasi peran tidak bisa bypass

```sql
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles WHERE rolname = 'app_user';
-- Harus: rolsuper = false, rolbypassrls = false.
```

## 4. Terapkan kebijakan RLS di cabang tersebut

```bash
bun run db:sql
```

(`scripts/apply-sql.mjs` menerapkan `src/server/db/*.sql` terurut ke
`DATABASE_URL` — pastikan `DATABASE_URL` menunjuk cabang yang sama dengan
langkah 1. File `rls.sql` idempoten, aman di-rerun.)

## 5. Isi connection string app_user

Bentuk `TEST_APP_DATABASE_URL` (cabang `vitest`, database `ledger_test`):

```text
postgresql://app_user:<password-kuat>@<host-neon>/ledger_test?sslmode=require
```

- Dev lokal: `APP_DATABASE_URL` (pool runtime non-superuser; integration
  test terhubung sebagai `app_user` agar RLS berlaku).
- `DATABASE_URL` tetap owner (migrasi + `TRUNCATE` antar suite).
- Jangan commit password ke repo — hanya di `.env` lokal / secret CI.

## 6. Uji bahwa isolasi berlaku

```bash
bunx vitest run tests/integration/posting-foundation.test.ts
```

- Tes `konteks org withOrg (A9) → withOrg menetapkan app.current_org
  dalam tx` mengunci bahwa helper mengeset `app.current_org`.
- Cek manual: sebagai `app_user` tanpa `SET app.current_org`,
  `SELECT * FROM accounts` harus mengembalikan **0 baris** (policy
  `tenant_isolation_*` memfilter ke `NULL`); setelah
  `SELECT set_config('app.current_org', '<org-uuid>', true)` hanya baris org
  tersebut yang terlihat.
