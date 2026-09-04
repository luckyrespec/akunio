# Spesifikasi Arsitektur: Modul Persediaan, Stok Opname, & Jurnal Penyesuaian (Akunio)

Tanggal: 2026-09-04  
Status: MENUNGGU REVIEW  
Modul: Persediaan & Stok Opname (Inventory & Stock Adjustment)  

---

## 1. Ringkasan Eksekutif & Tujuan Produk

Modul **Persediaan & Stok Opname** melengkapi Akunio sebagai SaaS akuntansi double-entry tingkat lanjut untuk UKM di Indonesia. Sistem ini mengakomodasi dua metode penilaian persediaan yang diakui standar akuntansi (SAK EMKM / IFRS for SMEs) dan perpajakan Indonesia (UU PPh Pasal 10):
1. **Rata-Rata Tertimbang (Weighted Average Cost / WAC)**
2. **Masuk Pertama Keluar Pertama (First In, First Out / FIFO)**

Serta dua metode sistem pencatatan akuntansi:
1. **Metode Perpetual (Real-time tracking)**
2. **Metode Periodik (Fisik berkala via Stok Opname)**

Sesuai filosofi Akunio:
* **"Seimbang dulu, posting kemudian"**: Semua penyesuaian nilai persediaan bermuara pada draf jurnal seimbang.
* **"AI/Sistem mengusulkan, manusia memutuskan"**: Selisih stok fisik vs buku dihitung valuasinya oleh sistem dan disiapkan sebagai **Draf Jurnal Penyesuaian (DRAFT)** agar akuntan/pemilik bisnis mereview dan memilih akun penampung sebelum posting final imutabel.
* **Integritas Kebijakan Akuntansi**: Metode penilaian & pencatatan dikunci selama tahun buku berjalan bila sudah ada transaksi `POSTED`, dan hanya dapat diubah pada pergantian tahun fiskal.

---

## 2. Kebijakan & Aturan Bisnis (Accounting Guardrails)

1. **Integritas Kebijakan Persediaan (*Policy Lock*):**
   * Pilihan metode (FIFO vs Average, Perpetual vs Periodik) dikonfigurasi saat onboarding (direkomendasikan oleh Nara AI) atau di pengaturan persediaan.
   * Sekali ada jurnal berstatus `POSTED` yang terkait persediaan/HPP pada tahun buku aktif, pengaturan terkunci menjadi *read-only*.
   * Perubahan metode hanya diizinkan saat **Tutup Buku Tahunan (Year-End Close)** untuk berlaku di tahun buku baru, memicu jurnal penyesuaian kumulatif saldo awal persediaan & saldo laba.
2. **Presisi Moneter:**
   * Nilai nominal moneter disimpan dalam bentuk minor `BigInt` (Rupiah murni tanpa floating point) sesuai standar kelas `Money` Akunio.
   * Kuantitas barang mendukung bilangan bulat maupun desimal (hingga 4 desimal) untuk satuan berat/volume (misal: Kg, Liter, Meter).
3. **Alur Stok Opname (Opsi A - Review & Approval via Draft):**
   * User membuat sesi Opname (`stock_opnames`).
   * Mengisi kuantitas fisik riil per SKU.
   * Sistem menghitung selisih unit dan valuasi moneter selisihnya berdasarkan metode penilaian aktif (Average / FIFO layer).
   * Menghasilkan **Draf Jurnal Penyesuaian (DRAFT)** dengan nomor urut `JE-YYYY-NNNN`.
   * User/akuntan memverifikasi akun beban/pendapatan selisih, lalu memposting jurnal.
   * Saldo buku stok barang di-*update* ke kuantitas fisik yang baru secara atomik.

---

## 3. Desain Skema Database (Drizzle ORM & PostgreSQL)

Tabel baru ditambahkan ke `src/server/db/schema/inventory.ts` dan dilindungi oleh RLS (`org_id`):

### 3.1 `inventory_settings` (Kebijakan per Organisasi)
- `valuationMethod`: `'WEIGHTED_AVERAGE' | 'FIFO'` (default: `WEIGHTED_AVERAGE`).
- `recordingMethod`: `'PERPETUAL' | 'PERIODIC'` (default: `PERPETUAL`).
- `inventoryAccountId`: Akun persediaan default (misal: `1-1300 Persediaan Barang Dagang`).
- `cogsAccountId`: Akun HPP default (misal: `5-1000 Beban Pokok Penjualan`).
- `adjustmentLossAccountId`: Akun beban selisih rugi/hilang (misal: `5-1900 Beban Selisih Persediaan`).
- `adjustmentGainAccountId`: Akun pendapatan selisih lebih (misal: `7-1900 Pendapatan Selisih Persediaan`).
- `isLocked`: boolean (terkunci otomatis jika sudah ada transaksi `POSTED` di tahun berjalan).

### 3.2 `inventory_items` (Master Data Barang & Saldo Buku)
- `code`, `name`, `barcode`, `unit` (Pcs, Box, Kg, dll), `category`.
- `minStockAlert`: batas minimum peringatan restock.
- `currentQty`: kuantitas stok saat ini.
- `totalCostMinor`: total nilai moneter buku persediaan (BigInt rupiah).
- `averageCostMinor`: biaya per unit saat ini (BigInt rupiah).
- `standardSellingPriceMinor`: harga jual standar.
- `isActive`: boolean.

### 3.3 `inventory_layers` (Antrean Batch Pembelian FIFO)
- `itemId`: foreign key ke item.
- `date`: tanggal perolehan batch.
- `initialQty`: kuantitas awal masuk.
- `remainingQty`: sisa kuantitas belum terjual.
- `unitCostMinor`: harga modal per unit batch ini.
- `referenceType` & `referenceId`: faktur/jurnal sumber.

### 3.4 `inventory_transactions` (Kartu Stok / Stock Ledger)
- `itemId`, `date`, `type` (`IN`, `OUT`, `ADJUSTMENT`).
- `qty`, `unitCostMinor`, `totalCostMinor`.
- `resultingQty`, `resultingTotalCostMinor`.
- `sourceType` (`INVOICE`, `JOURNAL`, `OPNAME`, `MANUAL`) & `sourceId`.

### 3.5 `stock_opnames` & `stock_opname_items` (Sesi & Baris Hitung Fisik)
- **`stock_opnames`**: `number` (`OPN-YYYY-NNNN`), `opnameDate`, `status` (`DRAFT`, `IN_PROGRESS`, `REVIEW_DRAFT_JOURNAL`, `COMPLETED`, `CANCELLED`), `totalDifferenceValueMinor`, `journalEntryId`, `notes`.
- **`stock_opname_items`**: `itemId`, `systemQty`, `physicalQty`, `differenceQty`, `unitCostMinor`, `differenceValueMinor`, `reason`.

---

## 4. Mekanisme Jurnal Penyesuaian (Adjustment Journal Engine)

### Kasus 1: Selisih Opname pada Metode Perpetual
* **Defisit (Fisik < Sistem):**
  * `Debit`: Beban Selisih Persediaan (atau Beban Barang Hilang/Rusak)
  * `Kredit`: Persediaan Barang Dagang
* **Surplus (Fisik > Sistem):**
  * `Debit`: Persediaan Barang Dagang
  * `Kredit`: Pendapatan Selisih Persediaan

### Kasus 2: Penyesuaian Akhir Periode pada Metode Periodik
Opname fisik akhir bulan digunakan untuk membentuk jurnal penutup/penyesuaian persediaan dan pengakuan HPP:
1. Menghapus Persediaan Awal: `Debit HPP` vs `Kredit Persediaan Awal`
2. Menutup Akun Pembelian: `Debit HPP` vs `Kredit Pembelian Barang`
3. Memunculkan Persediaan Akhir: `Debit Persediaan Akhir` vs `Kredit HPP`

Semua jurnal di atas dibuat sebagai entri `DRAFT` pada tabel `journal_entries` dengan `source: "STOCK_OPNAME"`, sehingga dapat diinspeksi oleh akuntan di rute `/jurnal` sebelum dikunci `POSTED`.

---

## 5. Rencana Antarmuka Pengguna (UI)

Menggunakan palet *Paper & Ink Matte* (Kanvas Arsip, Kertas Matte, Tinta Arsip, Terra Bata):
1. `/persediaan`:
   * KPI Ringkasan: Total Nilai Aset Stok (Rupiah), Jumlah SKU Aktif, Peringatan Stok Kritis (*Low Stock*).
   * Tabel Master Barang dengan filter kategori, pencarian SKU, dan aksi lihat Kartu Stok.
2. `/persediaan/opname`:
   * Riwayat sesi opname dengan status visual (*Draft, In Progress, Menunggu Review Jurnal, Selesai*).
3. `/persediaan/opname/baru`:
   * Formulir opname: tabel lembar hitung fisik dengan komparasi langsung `Stok Buku` vs `Stok Fisik` vs `Selisih Nilai (Rp)`.
   * Tombol aksi: *"Simpan Draf"* dan *"Buat Draf Jurnal Penyesuaian"*.
4. `/persediaan/opname/[id]`:
   * Detail hasil opname, rincian item bermasalah, dan kartu preview Draf Jurnal dengan tombol navigasi langsung ke halaman review jurnal.

---

## 6. Rencana Pengujian (Testing Strategy)

1. **Unit Test Kalkulasi:**
   * `inventory-valuation.test.ts`: Uji kebenaran kalkulasi Weighted Average Cost saat ada barang masuk dengan harga fluktuatif.
   * `inventory-fifo.test.ts`: Uji konsumsi antrean layer FIFO saat barang keluar parsial dan habis bertahap.
2. **Integration Test Ledger & RLS:**
   * `stock-opname-adjustment.test.ts`: Uji pembuatan sesi opname, pembuatan draf jurnal penyesuaian seimbang (Debit = Kredit), posting jurnal, dan verifikasi update saldo stok fisik.
   * `inventory-policy-lock.test.ts`: Verifikasi bahwa metode penilaian terkunci otomatis jika ada transaksi jurnal yang sudah `POSTED`.
