# Spesifikasi Desain Arsitektur: Aset Tetap & Guided Period Closing

**Tanggal:** 3 September 2026  
**Status:** Approved by User  
**Standar Akuntansi:** SAK EMKM Bab 10 (Aset Tetap) & Ketentuan Perpajakan Indonesia (UU PPh Kelompok Harta Berwujud)  
**Modul:** Sub-Proyek 2 (Workflow Bisnis & Siklus Akuntansi Lanjutan)

---

## 1. Latar Belakang & Tujuan

Aplikasi Neraca membutuhkan dua subsistem akuntansi inti untuk menyempurnakan siklus pembukuan periodik:
1. **Aset Tetap & Penyusutan Otomatis (*Fixed Assets & Auto-Depreciation*):**
   - Pencatatan register aset tetap, pemilihan metode depresiasi (*Straight-Line* / *Declining Balance*), kalkulasi jadwal amortisasi bulanan, posting beban penyusutan ke Buku Besar (GL), serta pelepasan/penjualan aset (*asset disposal*) dengan kalkulasi laba/rugi pelepasan.
   - Rekomendasi pintar oleh Nara AI berdasarkan klasifikasi SAK EMKM dan perpajakan Indonesia.
2. **Tutup Buku Terpandu (*Guided Period Closing Wizard*):**
   - *Pre-closing Checklist* interaktif yang memvalidasi rekonsiliasi bank, draf tertunda, depresiasi aset, faktur belum terposting, dan keseimbangan neraca saldo.
   - Penutupan periode bulanan (*monthly locking*) dan jurnal penutup akhir tahun buku (*year-end closing entries*) ke akun *Ikhtisar Laba Rugi* (3999) dan *Laba Ditahan* (3200).

---

## 2. Skema Basis Data & Keamanan Multi-Tenant (RLS)

File skema baru dibuat di `src/server/db/schema/assets.ts` dan diekspor melalui `src/server/db/schema/index.ts`.

### 2.1 Tabel `fixed_assets`
Menyimpan data master aset tetap:
- `id`: `uuid` PK default random.
- `orgId`: `uuid` NOT NULL REFERENCES `organizations(id)` ON DELETE CASCADE.
- `code`: `varchar(32)` NOT NULL (contoh: `AST-2026-0001`).
- `name`: `text` NOT NULL (contoh: "Laptop Lenovo ThinkPad T14").
- `category`: `text` NOT NULL (`TANAH`, `BANGUNAN`, `KENDARAAN`, `MESIN_PERALATAN`, `INVENTARIS_KANTOR`).
- `acquisitionDate`: `date` NOT NULL (tanggal perolehan).
- `inServiceDate`: `date` NOT NULL (tanggal mulai disusutkan).
- `acquisitionCostMinor`: `bigint` NOT NULL (biaya perolehan dalam sen rupiah).
- `salvageValueMinor`: `bigint` NOT NULL DEFAULT 0n (nilai residu/sisa).
- `usefulLifeMonths`: `integer` NOT NULL (masa manfaat dalam bulan).
- `depreciationMethod`: `text` NOT NULL (`STRAIGHT_LINE`, `DECLINING_BALANCE`).
- `depreciationRatePercent`: `numeric(5,2)` (tarif persentase jika metode saldo menurun).
- `assetAccountId`: `uuid` NOT NULL REFERENCES `accounts(id)` (Akun Aset 15xx).
- `accumulatedDepAccountId`: `uuid` NOT NULL REFERENCES `accounts(id)` (Akun Akumulasi Penyusutan 16xx).
- `depreciationExpenseAccountId`: `uuid` NOT NULL REFERENCES `accounts(id)` (Akun Beban Penyusutan 62xx).
- `status`: `text` NOT NULL DEFAULT `'ACTIVE'` (`ACTIVE`, `FULLY_DEPRECIATED`, `DISPOSED`).
- `notes`: `text`.
- `createdAt`: `timestamp with time zone` NOT NULL DEFAULT now().
- `updatedAt`: `timestamp with time zone` NOT NULL DEFAULT now().

Indeks unik: `uniqueIndex("fixed_assets_org_code_uq").on(t.orgId, t.code)`.

### 2.2 Tabel `asset_depreciation_lines`
Menyimpan jadwal dan riwayat posting beban penyusutan per periode:
- `id`: `uuid` PK default random.
- `orgId`: `uuid` NOT NULL REFERENCES `organizations(id)`.
- `assetId`: `uuid` NOT NULL REFERENCES `fixed_assets(id)` ON DELETE CASCADE.
- `periodName`: `varchar(7)` NOT NULL (contoh: `'2026-08'`).
- `depreciationDate`: `date` NOT NULL (tanggal akhir bulan penyusutan).
- `depreciationAmountMinor`: `bigint` NOT NULL (beban bulan ini).
- `accumulatedDepreciationMinor`: `bigint` NOT NULL (total akumulasi hingga bulan ini).
- `bookValueMinor`: `bigint` NOT NULL (nilai buku bersih setelah depresiasi).
- `journalEntryId`: `uuid` REFERENCES `journal_entries(id)` (nomor jurnal jika sudah diposting).
- `status`: `text` NOT NULL DEFAULT `'SCHEDULED'` (`SCHEDULED`, `POSTED`).
- `createdAt`: `timestamp with time zone` NOT NULL DEFAULT now().

Indeks unik: `uniqueIndex("asset_dep_asset_period_uq").on(t.assetId, t.periodName)`.

### 2.3 Tabel `asset_disposals`
Menyimpan riwayat pelepasan/penjualan/penghapusan aset:
- `id`: `uuid` PK default random.
- `orgId`: `uuid` NOT NULL REFERENCES `organizations(id)`.
- `assetId`: `uuid` NOT NULL REFERENCES `fixed_assets(id)`.
- `disposalDate`: `date` NOT NULL.
- `disposalType`: `text` NOT NULL (`SALE`, `SCRAP`, `WRITE_OFF`).
- `proceedsMinor`: `bigint` NOT NULL DEFAULT 0n (uang hasil penjualan).
- `bookValueAtDisposalMinor`: `bigint` NOT NULL (nilai buku pada saat pelepasan).
- `gainLossMinor`: `bigint` NOT NULL (laba/rugi pelepasan: `proceeds - bookValue`).
- `depositAccountId`: `uuid` REFERENCES `accounts(id)` (Akun Kas/Bank jika dijual).
- `gainLossAccountId`: `uuid` NOT NULL REFERENCES `accounts(id)` (Akun 7110/7210 Laba/Rugi Pelepasan Aset).
- `journalEntryId`: `uuid` NOT NULL REFERENCES `journal_entries(id)`.
- `notes`: `text`.
- `createdAt`: `timestamp with time zone` NOT NULL DEFAULT now().

### 2.4 Kebijakan RLS (Row Level Security)
Pada file `src/server/db/rls.sql`:
Ditambahkan blok DO idempotent untuk mengaktifkan RLS pada `fixed_assets`, `asset_depreciation_lines`, dan `asset_disposals` dengan aturan tenant isolation `org_id = current_setting('app.current_org_id', true)::uuid`.

---

## 3. Logika Domain Akuntansi (`src/core/`)

### 3.1 Perhitungan Depresiasi (`src/core/assets/depreciation.ts`)
1. **Metode Garis Lurus (*Straight-Line*):**
   - Basis Penyusutan = `acquisitionCostMinor - salvageValueMinor`.
   - Beban Bulanan = `basis / usefulLifeMonths`.
   - Penyesuaian Sen (*Penny Rounding*): Selisih pembagian sen dialokasikan ke bulan terakhir jadwal sehingga total penyusutan persis sama dengan basis penyusutan.
2. **Metode Saldo Menurun (*Declining Balance*):**
   - Nilai buku awal periode $t$: $\text{NBV}_{t-1}$.
   - Beban Bulanan: $\text{NBV}_{t-1} \times \text{Tarif Bulanan}$.
   - Pembatasan Nilai Residu (*Salvage Value Clamp*): Beban bulan berjalan dipangkas agar $\text{NBV}_t \ge \text{salvageValueMinor}$.
3. **Batch Depreciation Journal Lines Generator:**
   - Memfilter seluruh aset aktif yang memiliki jadwal belum terposting di periode `periodName`.
   - Menghasilkan baris debit pada Akun Beban Penyusutan dan kredit pada Akun Akumulasi Penyusutan.
   - Nilai total debit selalu sama dengan nilai total kredit.

### 3.2 Pelepasan Aset (*Asset Disposal Engine*) (`src/core/assets/disposal.ts`)
- Memvalidasi status aset masih `ACTIVE` atau `FULLY_DEPRECIATED`.
- Mengkalkulasi nilai buku bersih saat tanggal pelepasan.
- Menghasilkan jurnal 4-kaki yang berimbang:
  - **Debet:** Kas/Bank (sebesar `proceedsMinor` jika ada).
  - **Debet:** Akumulasi Penyusutan (menghapus saldo akumulasi sampai nol).
  - **Kredit:** Harga Perolehan Aset (menghapus nilai aset dari neraca).
  - **Balancing:**
    - Jika `proceedsMinor > bookValueMinor`: **Kredit** Laba Pelepasan Aset (7110).
    - Jika `proceedsMinor < bookValueMinor`: **Debet** Rugi Pelepasan Aset (7210).

### 3.3 Validator Tutup Buku (*Pre-closing Checklist*) (`src/core/periods/closing-checklist.ts`)
Memeriksa 5 syarat wajib sebelum periode dapat ditutup:
1. **Rekonsiliasi Bank:** Tidak ada sesi rekonsiliasi yang menggantung atau memiliki selisih saldo di periode berjalan.
2. **Draf Jurnal:** Tidak ada draf jurnal AI/pengguna yang berstatus `PENDING`.
3. **Depresiasi Aset:** Seluruh aset tetap aktif telah diposting penyusutannya untuk periode tersebut.
4. **Faktur Belum Terposting:** Tidak ada faktur penjualan/pembelian yang belum tercatat ke GL.
5. **Neraca Saldo Seimbang:** Total Debet = Total Kredit (selisih Rp 0).

### 3.4 Generator Jurnal Penutup Akhir Tahun (`src/core/periods/closing-journal.ts`)
Khusus periode akhir tahun fiskal (Desember):
- Menutup seluruh saldo akun Pendapatan (4xxx) ke Debet.
- Menutup seluruh saldo akun Beban (5xxx/6xxx) ke Kredit.
- Menyeimbangkan selisih ke akun *Ikhtisar Laba Rugi* (3999).
- Menutup saldo akun *Ikhtisar Laba Rugi* (3999) ke akun *Laba Ditahan* (3200) atau *Modal Pemilik* (3100).
- Mengubah status periode menjadi `CLOSED` / `LOCKED`.

---

## 4. Antarmuka Pengguna & Alur Kerja (UI/UX)

### 4.1 Halaman Aset Tetap (`/aset` & `/aset/[id]`)
- **Navigasi Sidebar:** Menu baru "Aset Tetap" dengan ikon `Building2`.
- **Daftar Aset (`/aset`):**
  - Kartu KPI: Total Biaya Perolehan, Total Akumulasi Penyusutan, Nilai Buku Bersih Total, dan Jumlah Aset Aktif.
  - Tabel Aset: Kode, Nama, Kategori, Tanggal Perolehan, Nilai Perolehan, Nilai Buku, Status.
  - Tombol **"+ Daftarkan Aset Baru"**: Membuka dialog form dengan integrasi tombol "Rekomendasi Cerdas Nara".
  - Tombol **"Jalankan Penyusutan Bulan Ini"**: Modal pratinjau daftar beban penyusutan seluruh aset aktif sebelum diposting resmi ke GL.
- **Detail Kartu Aset (`/aset/[id]`):**
  - Tab Informasi: Rincian spesifikasi aset, vendor, tanggal beli, dan akun COA terkait.
  - Tab Jadwal Penyusutan: Tabel baris bulan demi bulan dengan link ke nomor jurnal posting.
  - Dialog Pelepasan Aset (*Disposal*): Form penjualan/penghapusan dengan kalkulasi otomatis laba/rugi dan pratinjau jurnal.

### 4.2 Wizard Tutup Buku Terpandu (`/tutup-buku`)
- **Alur Stepper Wizard:**
  - **Langkah 1: Ringkasan Periode:** Informasi saldo kas, laba berjalan, dan status periode.
  - **Langkah 2: Pre-Closing Checklist:**
    - Visual checklist dengan status Lolos (hijau) / Perlu Tindakan (oranye).
    - Tombol aksi instan untuk menyelesaikan item yang belum tuntas (misal: "Posting Penyusutan Sekarang").
  - **Langkah 3: Jurnal Penutup (Jika Akhir Tahun):** Pratinjau penutupan Pendapatan & Beban ke Laba Ditahan.
  - **Langkah 4: Konfirmasi & Penguncian:**
    - Tombol "Kunci & Tutup Periode".
    - Mengubah status periode menjadi `CLOSED` atau `LOCKED`.

---

## 5. Integrasi Asisten Nara AI (`/api/nara`)

### 5.1 Alat-Alat Baru (*Function Calling Tools*)
1. `recommend_asset_depreciation`:
   - Parameter: `{ assetName: string, category: string, purchasePrice: number }`.
   - Logika: Menganalisis kelompok harta berwujud SAK EMKM / pajak, menentukan estimasi masa manfaat (tahun/bulan), metode penyusutan optimal, dan pemetaan akun COA.
2. `run_monthly_depreciation`:
   - Parameter: `{ periodName: string }`.
   - Logika: Menyiapkan jurnal penyusutan bulanan batch dengan kartu persetujuan `<Confirmation>` sebelum diposting.
3. `check_period_closing_readiness`:
   - Parameter: `{ periodName: string }`.
   - Logika: Menjalankan pre-closing checklist dan menyajikan status kesiapan tutup buku secara conversational.
4. `close_fiscal_period`:
   - Parameter: `{ periodName: string, isYearEnd?: boolean }`.
   - Logika: Menjalankan eksekusi tutup buku dan jurnal penutup akhir tahun dengan konfirmasi persetujuan pengguna.

---

## 6. Rencana Pengujian & Verifikasi Kualitas

1. **Unit Testing (`tests/unit/assets/` & `tests/unit/periods/`):**
   - Tes deterministik kalkulasi Garis Lurus dan Saldo Menurun (termasuk pembulatan sen dan pencegahan nilai buku di bawah residu).
   - Tes kalkulasi laba/rugi pelepasan aset.
   - Tes validasi 5 poin pre-closing checklist.
   - Tes jurnal penutup akhir tahun (keseimbangan debet/kredit).
2. **Integration Testing (`tests/integration/`):**
   - Tes repositori aset tetap (`assets.repo.ts`).
   - Tes eksekusi posting penyusutan ke GL (memastikan pembuatan baris jurnal resmi dan update status jadwal depresiasi).
   - Tes penguncian periode (memastikan transaksi tanggal lampau ditolak oleh posting guard setelah periode berstatus `CLOSED`).
3. **CI/CD Quality Gates:**
   - `bunx tsc --noEmit` wajib lolos tanpa error.
   - `bun run test` seluruh 63+ suite wajib hijau.
   - `bun run build` sukses terkompilasi dalam mode Turbopack.
