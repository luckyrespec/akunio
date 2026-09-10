# Spec: POS Lite + Operasional Harian (Dagang & F&B) — Akunio

Tanggal: 2026-09-10. Status: DRAFT menunggu review user. Slice A yang disetujui: "POS Lite menempel Persediaan+Kas".

## 1. Konteks & tujuan

Persona: pemilik toko dagang dan warung/F&B kasir harian (1–5 staf, hijrah dari spreadsheet/nota). Pekerjaan: jualan cepat di kasir, setoran shift, belanja operasional foto nota, diingatkan stok menipis + piutang jatuh tempo.

Prinsip produk yang mengikat (PRODUCT.md): seimbang dulu baru posting; POSTED final, koreksi via reversal; AI mengusulkan manusia memutuskan; setiap angka bisa ditelusur ke bukti dan jurnal.

Non-tujuan v1 (eksplisit tidak dikerjakan): payment gateway/QRIS auto-settlement (Xendit/Midtrans), webhook, multi-gudang/cabang, multi-currency, BOM manufaktur, e-Faktur DJP API, payroll PPh21, API publik, push notification mobile.

## 2. Arsitektur

Menempel, bukan sistem baru. Tiga fondasi yang dipakai ulang:

- Kas: `cash-bank.repo.ts` (`createCashEntryRepo` kind TERIMA/BAYAR, `postCashDraftRepo`, `idempotencyKey`, penomoran tahunan per kind + advisory lock) via server actions `cash-bank.actions.ts` + `withOrg` (wajib — RLS `app.current_org` di bawah `app_user`).
- Stok: `inventory.repo.ts` (layers/transactions, WAC/FIFO, `lockInventoryPolicy`, opname adjustment) + `inventory-sku.ts` (`nextSkuCodes`, `appBarcode` internal `20_000_000+seq`).
- Jurnal: `journals.repo.ts` (`validate → post → immutable`, trigger `forbid_posted_mutation`, reversal via `reversal_of_id`, counter `journal_seq_counters` + advisory lock).

Unit baru hanya dua: modul Kasir (UI + orkestrasi checkout) dan modul Shift/Setoran. Keduanya menelepon repo lama dalam satu transaksi — tidak ada jalur posting paralel.

Alur data checkout (satu transaksi `withOrg`):
`POST /kasir checkout` → validasi stok + hitung total (BigInt minor) → kunci advisory per org+hari → insert `pos_sales` + `pos_sale_items` → decrement stok via fungsi inventory yang sama dengan opname (perpetual) → buat jurnal sumber POS (debit Kas, kredit Pendapatan + HPP/Persediaan bila barang) → buat `kas_bank_entries` kind TERIMA tertaut → commit. Gagal di langkah mana pun = rollback penuh, kasir dapat pesan satu kalimat Bahasa Indonesia.

## 3. Komponen & rute

- `/kasir` (baru, grup Operasional di sidebar di bawah Kas & Bank, ikon IconReceipt/IconInventory). Layout full-bleed fluid, keyboard-first: kolom kiri search barang (nama/kode/`barcode`/`appBarcode`), grid barang + badge stok menipis; kolom kanan keranjang (qty +/-, diskon per item, hapus), ringkasan, metode bayar TUNAI/QRIS/TRANSFER, tombol Bayar terra split-button (pola `persediaan-client.tsx`/`NewEntryForm`, `h-9 rounded-xl`). `PageHeader` title "Kasir", eyebrow "Operasional". Setelah bayar: struk print CSS thermal + tombol Bagikan WA (`wa.me/?text=`) + tombol Transaksi Baru. `data-testid`: `kasir-search`, `kasir-cart-*`, `kasir-pay-*`, `kasir-receipt`.
- `/kas-bank/setoran` (baru, child Kas & Bank "Setoran Shift"). Form: shift aktif (kas awal, kasir, dibuka), input kas akhir tunai + non-tunai, otomatis hitung ekspektasi dari `pos_sales` shift, selisih → tombol Buat Jurnal Selisih (DRAFT, akun lawan pilih via `AccountSelect`, pola setiap field akun). Tutup shift mengunci penjualan shift itu.
- Expense cepat: TIDAK ada rute baru. Tambah tombol "Foto Nota" di `/kas-bank/pembayaran/baru` yang memakai upload S3 yang ada (≤5MB, `ALLOWED_MIMES`) + ekstraksi NARA yang ada → prefill form `KAS_BAYAR` DRAFT. AI mengusulkan, kasir memutuskan.
- Dasbor: tambah kartu "Perlu Perhatian Hari Ini" (computed, tanpa tabel baru): stok ≤ `minStockAlert` (reuse `getInventoryOverviewAction.lowStockItems`), piutang overdue + jatuh ≤3 hari (reuse `getAgingReportRepo`), PPh final deadline bulan berjalan. Link ke `/persediaan/daftar`, `/faktur`, `/pajak`. Tanpa push — in-app saja.
- Import migrasi: tombol import CSV di `/persediaan/daftar` (produk) dan `/kontak` (kontak); XLSX ditunda ke v2 karena butuh dependensi parser baru. Kolom minimal produk: `nama, harga_jual, stok_awal, harga_beli, barcode?`; kontak: `nama, tipe, telepon?`. Template unduhan + laporan baris gagal per baris. Bukan full saldo-awal coa di v1.

## 4. Data & migrasi (dua lane, ikuti AGENTS.md)

Lane Drizzle (tabel, hand-write SQL + `--> statement-breakpoint`, entri `_journal.json`, tanpa snapshot; preseden `0012`, `0013`):

- `pos_shifts`: id, org_id, `opened_by`, `opened_at`, `closed_at NULL`, `opening_cash_minor numeric(18,2)`, `cash_account_id` (akun kas `isCash`), status BUKA/TUTUP, UNIQUE (org_id, id) + partial unique satu shift BUKA per akun kas.
- `pos_sales`: id, org_id, `shift_id NULL` (jualan tanpa shift tetap sah; shift TUTUP menolak penjualan baru yang mengacu padanya, penjualan yang sudah POSTED tetap immutable dan koreksinya via reversal seperti biasa), nomor `POS-YYYY-NNNN` (counter tahunan per org + advisory lock, pola `kas_bank_seq_counters`), `sold_at`, `payment_method` (TUNAI/QRIS/TRANSFER — satu metode per penjualan di v1; MIXED ditunda ke v2), `cash_account_id`, `subtotal_minor`, `discount_minor`, `total_minor` (numeric 18,2), `cash_received_minor`, `change_minor`, `buyer_name NULL` (penjualan kasir tanpa kontak/master pelanggan di v1; piutang kasir tidak didukung — yang tempo lewat Faktur), `journal_entry_id`, `kas_entry_id`, `idempotency_key` UNIQUE per org (anti double-tap).
- `pos_sale_items`: id, `sale_id`, `item_id` (BARANG saja; JASA tidak dijual di kasir v1), `qty numeric`, `unit_price_minor`, `discount_minor`, `line_total_minor`, `unit_cost_minor` (snapshot HPP saat jual untuk audit).

Lane raw SQL (`src/server/db/*.sql`, sorted): tambah sumber jurnal `POS` dan `POS_SELISIH` ke CHECK `je_source_chk` — HANYA di `tax.sql` (pemilik terakhir menang alfabetis; jangan sentuh `hardening.sql`). Tambah index `(org_id, sold_at)`, `(org_id, shift_id)`.

Keputusan eksplisit: harga kasir sudah termasuk pajak (tidak ada PPN 11% di v1 — harga UMKM rak sudah final). Diskon per item + diskon header didukung, tercatat di minor terpisah agar bisa diaudit. JASA dikecualikan dari kasir v1 (tidak ada decrement stok; jual jasa tetap lewat Faktur). Stok negatif ditolak dengan pesan "Stok X kurang (sisa N)" — tidak ada backorder di v1.

## 5. Uang, stok, dan jurnal

- Uang: semua nominal `numeric(18,2)` di DB, dihitung sebagai minor BigInt via `Money.parseIdr`/`formatIdr`. Tidak ada `number` untuk uang di server. Kembalian = diterima − total; diterima < total ditolak sebelum transaksi dibuka.
- Stok: decrement memakai jalur perpetual yang sama dengan opname (layers FIFO/WAC sesuai `inventory_settings` yang terkunci via `lockInventoryPolicy`). HPP snapshot per baris ke `unit_cost_minor`. `JASA`/`standardSellingPriceMinor` dipakai sebagai harga default yang bisa diubah di keranjang (perubahan tercatat per baris, tidak mengubah master).
- Jurnal POS per penjualan (POSTED langsung, karena uang sudah berpindah — sama semantiknya dengan KAS_TERIMA `post` default): debit Kas (total), kredit Pendapatan (subtotal−diskon), debit HPP + kredit Persediaan (per barang). Jurnal selisih setoran: DRAFT via `AccountSelect`, harus di-post manual — tidak ada auto-post selisih.

## 6. Auth, RLS, edge cases

- Kasir jualan + buka/tutup shift: `requireContext(["OWNER", "ACCOUNTANT"])`. VIEWER read-only. Kasir toko = role ACCOUNTANT (tidak perlu role baru di v1).
- Semua transaksi tenant-scoped via `withOrg`; RLS `FORCE RLS` per `org_id` tetap berlaku untuk tabel baru (tambah policy di lane raw SQL mengikuti `rls.sql`).
- Idempotensi: client generate `idempotency_key` per klik Bayar; retry aman; double-submit mengembalikan penjualan yang sama.
- Konkurensi: advisory lock per org+hari untuk nomor POS; decrement stok dalam transaksi — dua kasir menjual stok terakhir bersamaan, satu menang, satu dapat pesan stok kurang.
- Periode tutup: checkout ke tanggal pada periode TERKUNCI ditolak ("Periode terkunci — pilih tanggal periode terbuka"), mengikuti `periods.repo`.
- Struk: render dari data server (bukan state client) agar tidak bisa diutak-atik; memuat nomor POS, tanggal, item, total, metode, kasir, dan `journal_entry_id` untuk telusur.

## 7. Testing

- Vitest integrasi (`bunx vitest run tests/integration/pos-lite.test.ts`): checkout tunai pas (kas + jurnal + stok konsisten), kembalian benar, stok kurang rollback penuh, double-submit satu penjualan, shift selisih → DRAFT, periode terkunci ditolak. Wajib `guardTestDb` (DB `ledger_test`) dan tambah tabel baru ke TRUNCATE di `tests/integration/helpers.ts` atau seluruh suite integrasi pecah.
- E2E Playwright (`workers:1`, `data-testid kasir-*` stabil, tunggu `networkidle` + hidrasi sebelum klik; `global-setup.ts` warming berlaku).
- `bunx tsc --noEmit` strict (tanpa `any`) dan `bun run build` tetap hijau.
- Storage/upload mengikuti pola skip bila S3 tak terjangkau (`SKIP_STORAGE_TESTS=1`).

## 8. Rollout (berfase dalam satu plan)

Fase 1 (inti kasir): `/kasir` checkout + struk + `pos_sales`/`pos_sale_items` + jurnal POS. Fase 2 (kontrol harian): `/kas-bank/setoran` shift + selisih DRAFT. Fase 3 (tipis): tombol foto nota di pembayaran + kartu pengingat dasbor + import CSV produk/kontak. Tiap fase diakhiri `tsc` + `build` hijau + test fasenya.

v1 tanpa feature flag (rute baru, tidak mengganggu flow lama). Kriteria selesai: kasir bisa jualan 10 item <30 detik, setoran shift seimbang, expense foto nota jadi DRAFT, dasbor menampilkan 3 pengingat, import 100 produk via CSV tanpa error. Setelah v1 stabil, kandidat v2: QRIS gateway (Xendit), import mutasi bank CSV, export laporan PDF/Excel.
