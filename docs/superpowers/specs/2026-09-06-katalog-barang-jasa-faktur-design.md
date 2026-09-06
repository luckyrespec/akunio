# Desain: Katalog Barang + Jasa terpadu + faktur campuran

Tanggal: 2026-09-06
Status: disetujui per-section via brainstorming (arsitektural)
Keputusan kunci: Opsi A — satu tabel `inventory_items` + kolom `item_type`, faktur campur barang+jasa, faktur posting jadi pintu mutasi.

## 1. Latar & tujuan

- `invoice_items` saat ini free-text (`description, quantity, unit_price_minor, discount_minor, tax_rate_percent, total_minor`, `src/server/db/schema/invoicing.ts:103-126`) tanpa FK ke `inventory_items`. Faktur jasa bisa diketik manual, tapi tidak ada master jasa, harga tidak konsisten, tidak ada laporan jasa.
- `inventory_items` hanya barang berstok (`currentQty, totalCostMinor, averageCostMinor`, layers FIFO, opname; `src/server/db/schema/inventory.ts:55-91`). Tidak ada konsep jasa.
- Penjualan/pembelian faktur belum mutasi stok sama sekali (`sourceType INVOICE` ada di enum `inventory_transactions` tapi tidak ada pemanggil; posting hanya `Dr Piutang / Cr Pendapatan + PPN` via `src/server/invoicing/posting.ts`).
- Target: satu katalog Barang + Jasa agar 1 faktur bisa campur (contoh salon: jasa cuci + shampo), harga auto-fill dari master, stok + HPP otomatis untuk barang (perpetual), jasa tanpa mutasi.

## 2. Skema & migrasi (tanpa tabel baru)

- `inventory_items` tambah `item_type TEXT NOT NULL DEFAULT 'BARANG'`, CHECK `IN ('BARANG','JASA')`. Data lama otomatis BARANG. Baris JASA: `currentQty/totalCostMinor/averageCostMinor = 0`, tidak boleh punya `inventory_layers` / `inventory_transactions`; semua query stok wajib filter `item_type='BARANG'` (guard di repo, bukan CHECK lintas tabel).
- `inventory_items` tambah `revenue_account_id UUID NULL → accounts(id)` (akun pendapatan per item; jasa default 4130→4100, barang default 4110→4100; null = pakai default org saat posting). Tambah `expense_account_id UUID NULL → accounts(id)` untuk baris BILL jasa (default beban dari master, fallback 5100). Tanpa kolom ini posting tetap agregat ke satu akun seperti sekarang.
- SKU reuse `inventory_sku_counters`: BARANG `BRG-NNNN`, JASA `JSA-NNNN`; `app_barcode` tetap numerik 8 digit unik per org (JASA boleh null; UI sembunyikan barcode untuk jasa). `nextSkuCodes` (`src/server/db/repos/inventory-sku.ts`) tambah param tipe.
- `invoice_items` tambah `catalog_item_id UUID NULL → inventory_items(id) ON DELETE RESTRICT` + index `(catalog_item_id)`. Snapshot `description/qty/harga/diskon/pajak/total` tetap sumber kebenaran historis; FK hanya referensi. `null` = ketik manual sekali-pakai (tetap didukung). Master yang sudah dipakai faktur tidak boleh hapus fisik (RESTRICT), hanya soft `isActive=false`.
- Index baru: `(org_id, item_type)` di `inventory_items`.
- Migrasi dua jalur (wajib repo ini): hand-write `drizzle/0015_*.sql` (`IF NOT EXISTS`, pemisah `--> statement-breakpoint`, entri `meta/_journal.json`, tanpa snapshot; preseden `0012`, `0013`, `0014`) + CHECK/FK di file raw `src/server/db/*.sql` terurut. Tidak ada tabel baru → list TRUNCATE `tests/integration/helpers.ts` tidak berubah; RLS `FORCE RLS` tidak berubah; semua transaksi tenant via `withOrg` (`src/server/db/repos/with-org.ts`).
- Uang tetap `numeric(18,2)` / minor BigInt via `Money.parseIdr/formatIdr` (`src/core/money/money.ts`); qty `numeric(12,4)` barang / `numeric(12,2)` faktur (konversi eksplisit, truncasi ±Rp1 seperti `valuation.ts`).

## 3. Jurnal & mutasi stok (faktur posting = pintu mutasi)

- **Kapan mutasi:** hanya saat posting (`createInvoiceWithPostingAction` / `postInvoiceToJournalAction` → `journal_entry_id` terisi, status `ISSUED`). DRAFT tidak mutasi. Idempoten: jika `journal_entry_id` sudah ada, lewati mutasi. VOID → jurnal pembalik `reversal_of_id` + kembalikan qty (patuhi `forbid_posted_mutation`, `JE-YYYY-NNNN` per `journals.repo.ts`).
- **Jual INVOICE + PERPETUAL:** tiap baris BARANG → `OUT` (`currentQty` kurang, konsumsi FIFO tertua / update WAC, tulis `inventory_transactions sourceType=INVOICE sourceId=invoice.id` + jurnal `Dr HPP (cogsAccountId) / Cr Persediaan (inventoryAccountId)`). Baris JASA → tanpa mutasi. Jurnal pendapatan dipecah per akun: `Dr Piutang (1200) total / Cr Penjualan Barang (netto barang) / Cr Pendapatan Jasa (netto jasa) / Cr PPN Keluaran (2200)`. Akun per baris = `revenue_account_id` master → fallback default org.
- **Jual INVOICE + PERIODIC:** tanpa mutasi qty, tanpa jurnal HPP. Hanya `Dr Piutang / Cr Pendapatan...`. HPP + koreksi via Opname (sesuai copy existing `inventory-settings.tsx`).
- **Beli BILL + PERPETUAL:** baris BARANG → `IN` (qty tambah, tambah FIFO layer `referenceType=PURCHASE referenceId=invoice.id`, update average) + `Dr Persediaan / Cr Utang (2100)`. Baris JASA → `Dr Beban (expense_account_id → 5100) / Cr Utang`, tanpa stok.
- **Beli BILL + PERIODIC:** baris BARANG ke akun Pembelian (tanpa tambah qty); HPP via opname.
- **Validasi & konkurensi:** qty ≤0 / harga negatif ditolak client+server. Stok minus diizinkan dengan warning kuning (kasir tetap jalan), bukan blokir. Satu transaksi `withOrg` + `pg_advisory_xact_lock` per item (`inv:{itemId}`) + lock faktur agar tidak double-posting. Resolve akun fail-closed: mapping hilang → faktur simpan DRAFT + `postWarning`, tidak posting setengah.
- PPN tetap agregat per faktur seperti `core/invoicing/calculations.ts` (tidak pindah ke master).

## 4. UI/UX (menu + form + picker)

- **Menu:** parent tetap `Persediaan & Stok` (`src/components/sidebar-nav.tsx`, `match: p.startsWith("/persediaan")`). Children: `Daftar Barang` (`/persediaan/daftar`, existing) + `Jasa & Layanan` (`/persediaan/jasa`, baru: list + `/baru` + `/[id]`) + `Stok Opname` (existing). Tiap child `PageHeader` sendiri; back-link pola `jurnal/baru`; redirect `/persediaan` → `/persediaan/daftar` tetap.
- **Form Jasa:** Kode `JSA-NNNN` auto + Generate (editable), Nama, Kategori opsional, Satuan default `Sesi` (bebas: Sesi/Kali/Paket/Jam), Harga jual, Akun pendapatan (`AccountSelect`, never native select), Akun beban pembelian opsional, Deskripsi, Aktif. Tanpa stok/HPP/foto/opname. List: card `rounded-xl border-rule`, thead `text-[11px] uppercase`, `tnum`, tanpa kolom foto/stok.
- **Picker faktur (`faktur-baru-client.tsx`):** kolom Deskripsi → combobox searchable gabungan (badge BARANG/JASA, tampil harga + sisa stok barang PERPETUAL / `tanpa stok` untuk jasa). Pilih → auto-fill harga/satuan/pajak, tetap editable (snapshot). Opsi `Ketik manual` (FK null). Warning kuning jika qty barang > stok. Template cetak (`template-formal/modern`) tidak berubah (pakai snapshot). Semua amount `Money.formatIdr`; copy Bahasa Indonesia.
- **`data-testid` baru:** `persediaan-jasa-*`, `faktur-item-picker`, `faktur-stok-warning`. Kontrak lama (`kas-bank-*`, `onboarding-*`, `persediaan-*` existing) tidak diubah.

## 5. AI tools, error handling, testing

- **AI (`src/server/ai/tools/inventory.tools.ts`):** `list_inventory_items` tampilkan `itemType` + jasa; tambah `add_service_item` (required hanya `name`, regex `JSA-` inline di prompt; wajib konfirmasi user seperti existing). Batch AI tetap barang saja. Respons kembalikan kode + akun terpakai.
- **Error mapping:** unique violation `(org, code/app_barcode)` → pesan ramah; `KEBIJAKAN_TERKUNCI` tetap; stok berubah sejak form dibuka → rollback atomic + pesan "Stok berubah, ulangi".
- **Vitest (`fileParallelism:false`, `tests/setup.ts` rewrite ke `ledger_test`):** JASA tanpa layers/transactions; faktur campur PERPETUAL (jurnal pecah + qty tepat + WAC/FIFO benar); PERIODIC tanpa mutasi/HPP; posting 2x idempoten; VOID kembalikan stok + reversal link; duplikat kode → pesan ramah; qty ≤0 ditolak. Single file: `bunx vitest run tests/integration/<file>.test.ts`.
- **Playwright (`workers:1`, `reuseExistingServer:true`):** navigasi 3 children; tambah jasa + Generate; faktur salon 1 jasa + 1 barang; warning stok minus; `goto` + `networkidle` + tunggu hidrasi sebelum klik. Jaga `prefers-reduced-motion`, tidak perlu animasi baru (jika perlu: search motion docs dulu, import dari `motion`, never `framer-motion`).

## 6. Non-tujuan (YAGNI)

- Bundling/paket jasa+barang, harga bertingkat per pelanggan, pajak per-item master, foto jasa, cetak label barcode jasa, kompres server-side (`sharp`), backfill `catalog_item_id` untuk faktur lama (tetap null = manual).
