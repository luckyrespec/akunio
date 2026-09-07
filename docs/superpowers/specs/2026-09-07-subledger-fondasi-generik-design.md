# Fondasi Generik Subledger (Buku Besar Pembantu) — Design Spec

Tanggal: 2026-09-07
Status: Disetujui (pendekatan A, enforcement B1)
Referensi: https://www.jurnal.id/id/blog/contoh-cara-membuat-buku-besar-pembantu-persediaan/

## 1. Latar & Tujuan

Artikel Mekari menegaskan pola yang benar: 1 akun kontrol di Buku Besar
Umum + N akun rincian di Buku Pembantu, dengan syarat
`total pembantu == saldo kontrol`. Membuat 1 akun GL per SKU
(COA explosion) ditolak: COA tidak terbaca, laporan berat, kontrol hilang.

Kondisi Akunio saat ini sudah 80% ke arah ini tanpa disadari:
`inventory_settings.inventory_account_id` sebagai kontrol,
`inventory_items + inventory_transactions + inventory_layers` sebagai
pembantu persediaan; `contacts + invoices` sebagai embrio pembantu
piutang/utang; `fixed_assets + depreciation_lines` sebagai pembantu aset.
Yang belum ada: registry kontrol, jejak GL ↔ pembantu, dan rekonsiliasi.

Tujuan: fondasi generik `kontrol ↔ subledger` yang dipakai semua modul
berikutnya (persediaan dulu, lalu piutang/utang, dst.).

Non-tujuan (v1): kontrol ASET_TETAP, multi-gudang, multi-kontrol per kind,
unifikasi satu tabel `subledger_entries`.

## 2. Keputusan Kunci (dikunci saat brainstorming)

- Enforcement **B1 (blokir)**: akun kontrol tidak bisa disentuh jurnal
  manual. Mutasi hanya via modul (Faktur, Persediaan/Opname, Pembayaran,
  Kas-Bank terkontrol). Ini yang dipakai Accurate / Mekari / Zahir /
  Xero / Odoo / SAP B1 (akun kontrol = system account).
- Pendekatan **A (registry + blokir di app layer)**: 2 tabel tipis,
  tanpa duplikasi ledger, tanpa trigger DB.
- Database **boleh reset**: tanpa backfill/dual-mode. Skema bersih dari awal.

## 3. Arsitektur & Model Data

GL tetap satu-satunya sumber nilai (`journal_lines`). Tabel domain tetap
jadi pembantu masing-masing. Fondasi hanya tambah lem + jejak:

### 3.1 `subledger_controls` (registry)

- `id uuid PK`, `org_id uuid FK → organizations (cascade)`
- `kind text: PIUTANG | UTANG | PERSEDIAAN` (v1 tiga ini dulu)
- `control_account_id uuid FK → accounts.id (restrict)`
- `allow_manual bool default false` (terkunci, hanya seed/pengecualian
  saldo awal yang boleh lewat)
- Unique `(org_id, kind)` + unique `(org_id, control_account_id)`
- `FORCE RLS` + index `(org_id, kind)`; tulis lewat `withOrg`.

Seed onboarding: `PIUTANG→1200, UTANG→2100, PERSEDIAAN→1310
(fallback 1300)`. `inventory_settings.inventory_account_id` dihapus dari
skema (sumber tunggal pindah ke registry); `inventory_settings` tinggal
simpan `cogsAccountId + metode + lock`.

### 3.2 `subledger_journal_links` (jejak GL ↔ pembantu)

- `id uuid PK`, `org_id uuid FK (cascade)`
- `journal_line_id uuid FK → journal_lines.id (cascade)`
- `kind text` (= kind kontrol), `ref_id uuid`
  (contact_id / item_id / asset_id sesuai kind)
- `amount_minor bigint`, `qty numeric(12,4) nullable` (untuk stok)
- Index `(org_id, kind, ref_id)` + `(journal_line_id)`.

Link table (bukan kolom di `journal_lines`) karena baris HPP/Persediaan
itu agregat: 1 baris `Cr Persediaan` bisa berasal dari N SKU. Aturan:
1 baris kontrol boleh punya N link, `sum(links.amount) == nominal baris`.

## 4. Validasi B1 + Titik Enforcement

Fungsi murni `validateSubledgerControl` di `src/core/subledger/guard.ts`:

1. Baris sentuh akun kontrol + `source = MANUAL / AI / IMPORT` →
   tolak `AKUN_KONTROL_WAJIB_VIA_MODUL` (pesan sebut modul tujuan).
2. Baris sentuh akun kontrol + `source = modul
   (DOCUMENT / STOCK_OPNAME / KAS_* / TAX)` → wajib links, jumlah cocok,
   kind cocok, `ref_id` ada di tabel domain org yang sama.
3. Pengecualian tunggal: saldo awal onboarding (`isOpeningBalance=true`,
   hanya engine onboarding, tidak diekspos ke UI/AI/tools).

Enforcement di 3 titik `src/server/db/repos/journals.repo.ts`:
`postJournalEntry`, `createDraftJournalEntry`, `postDraftEntry` — panggil
guard setelah `checkPostingAccounts`, sebelum insert, dalam tx yang sama.
Draft dijaga juga agar tidak lolos saat posting.

UX `AccountSelect`: v1 akun kontrol tetap terlihat (tidak merusak AI
composer/debug) tapi server fail-closed; badge kecil "via modul" sebagai
hint opsional.

## 5. Aliran Data per Modul + Rekonsiliasi

Semua atomik dalam satu tx `withOrg`: tabel domain + jurnal + links.

- **Jual (PERPETUAL):** `applyInvoiceStockOut` per BARANG
  (`inventory_transactions OUT`, konsumsi FIFO/WAC) → `Dr 1200 total`
  (1 link PIUTANG→contact), `Cr pendapatan/PPN` (tanpa link),
  `Dr HPP / Cr Persediaan` (N link PERSEDIAAN→item + qty menempel pada
  baris Persediaan saja; baris HPP adalah akun arus non-kontrol, tanpa link).
  JASA tanpa link stok. PERIODIC: tanpa mutasi/link saat jual.
- **Beli:** `Dr Persediaan` (N link per item) + `Dr Beban jasa/PPN` →
  `Cr 2100` (1 link UTANG→contact).
- **Pelunasan** (`postInvoicePaymentToLedger`): `Dr Kas / Cr 1200` atau
  `Dr 2100 / Cr Kas`, 1 link ke contact yang sama (kartu per pelanggan;
  nomor faktur di memo).
- **Opname** (`postOpnameAdjustment`): `ADJUSTMENT` + layer + jurnal
  selisih, link PERSEDIAAN per item sebesar `differenceValue`.
- **Kas-bank:** `counterAccount` 1200/2100 wajibkan picker kontak
  (aman, tanpa HPP). Langsung ke Persediaan via kas-bank tetap diblokir.
- **Void/reversal:** tulis link kebalikan (ikuti `voidInvoiceWithReversal`
  yang sudah kembalikan stok).

Rekonsiliasi (tutup loop `total pembantu == kontrol`): fungsi per kind
(piutang: `sum(tagihan aktif - dibayar)` vs GL 1200 POSTED; utang vs 2100;
persediaan: `sum(totalCostMinor)` vs saldo GL 1310/1300 POSTED) + runner generik.
Dipakai di layar selisih per kontrol + check doctor baru
`SUBLEDGER_MISMATCH` (HIGH jika ≠ 0). Kartu rincian pakai list existing
(kartu stok = transaksi per SKU, kartu piutang = faktur per kontak).

## 6. Error, Testing, Rollout

- **Error:** cek berurutan periode → kepemilikan akun → kontrol. Kode:
  `AKUN_KONTROL_WAJIB_VIA_MODUL`, `SUBLEDGER_REF_WAJIB`,
  `SUBLEDGER_TOTAL_TIDAK_COCok (selisih RpX)`,
  `KONTROL_BELUM_DIPETAKAN`. Toast/action error + tool error, tanpa tebakan.
- **Testing:** unit (guard + matematika recon); integrasi (`app_user` +
  `withOrg`): manual ke kontrol ditolak di 3 entrypoint, modul tulis
  atomik, selisih injeksi terdeteksi, void tulis link balik; E2E: pesan
  modul tampil, kartu SKU + layar selisih tampil. Tambah 2 tabel ke
  TRUNCATE `tests/integration/helpers.ts`.
- **Rollout (reset):** SQL tulis-tangan (`IF NOT EXISTS`,
  `--> statement-breakpoint`, entri journal, tanpa snapshot; preseden
  `0012/0013`), RLS di `*.sql` terurut, `CHECK source` tetap milik
  `tax.sql`. Tanpa skrip migrasi data.
