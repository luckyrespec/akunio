# Desain: Buku Pembantu Aset Tetap + Beban Dibayar di Muka (SAK EMKM)

Tanggal: 2026-09-09
Status: Disetujui per-section (arsitektur, jurnal, UI) — menunggu review tertulis
Keputusan kunci: scope **Aset + Dimuka dulu** (Utang Bank belakangan) · posting **tombol per bulan** (bukan auto saat tutup buku, bukan manual penuh) · **Opsi A: extend registry** (bukan tabel JSON generik, bukan modul terpisah)

## 1. Konteks & Masalah

Buku Pembantu hari ini hanya 3 kind (`PIUTANG`, `UTANG`, `PERSEDIAAN`, lihat `src/server/db/schema/subledger.ts:5`) dengan kontrol `1200/2100/1310` (seed di `src/server/onboarding/engine.ts:657`).

Kesenjangan untuk UMKM (SAK EMKM):

- Akun `1600 Sewa Dibayar di Muka` (COA `src/core/accounts/coa-template.ts:14`) tidak punya rincian per kontrak. Saldo GL bisa jalan sendiri tanpa ada yang memverifikasi.
- Modul Aset Tetap sudah ada (`fixed_assets` + `asset_depreciation_lines` + dialog "Jalankan Penyusutan" di `src/app/(app)/aset/aset-client.tsx`) tetapi belum terdaftar sebagai buku pembantu, jadi tidak muncul di `/buku-pembantu` dan tidak ikut rekonsiliasi kontrol-vs-rincian.
- SAK EMKM memakai basis akrual sederhana: sewa/asuransi dibayar di muka diakui proporsional tiap bulan lewat jurnal penyesuaian; aset tetap disusutkan (garis lurus cukup sebagai default). Tidak perlu pajak tangguhan / revaluasi / komponen kompleks.

Yang disengaja TIDAK masuk scope: Utang Bank per fasilitas (`2400`, ditunda ke fase berikut), kas-bank per rekening (itu buku kas, bukan pembantu), PPN per faktur (tercover faktur + pajak), ekuitas per setoran (cukup buku besar).

## 2. Arsitektur

Satu registry, renderer beda per kind. Pola yang dipakai ulang: `subledger_controls` + `subledger_journal_links` + `reconcileSubledger`/`reportSubledgerMismatch` (`src/server/db/repos/subledger.repo.ts`) + kartu `/buku-pembantu` (`src/app/(app)/buku-pembantu/page.tsx`).

```
subledger_controls (kind: PIUTANG|UTANG|PERSEDIAAN|ASET_TETAP|DIMUKA)
  ├─ PIUTANG/UTANG  → invoices + invoice_payments (per kontak, via buildContactCard)
  ├─ PERSEDIAAN     → inventory_items + inventory_transactions (per SKU)
  ├─ ASET_TETAP     → fixed_assets + asset_depreciation_lines (per unit, REUSE tabel)
  └─ DIMUKA         → prepaid_contracts + prepaid_schedule_lines (per kontrak, BARU)
```

Aturan keras: uang `numeric(18,2)` di DB dan `Money` BigInt minor di kode (`src/core/money/money.ts`). Tidak ada `number` untuk rupiah. Tidak ada edit jurnal POSTED (trigger `forbid_posted_mutation`); koreksi via `reversal_of_id`.

## 3. Model Data

### 3.1 Enum + kontrol

- `subledgerKindEnum` ditambah `"ASET_TETAP"`, `"DIMUKA"`. Tiga kind lama tidak berubah.
- Seed kontrol: `DIMUKA → 1600`, `ASET_TETAP → 1500` (catatan recon §3.4). Org lama di-backfill `INSERT ... ON CONFLICT DO NOTHING (org_id, kind)`.
- Kontrol wajib akun daun (aturan `GROUP_ACCOUNT`): induk seperti `1000/1500-grup` ditolak; `1500 Peralatan` + `1590 Akumulasi` adalah daun dan boleh dipakai.

### 3.2 Tabel baru: prepaid (DIMUKA)

`prepaid_contracts`: `id, org_id, code` (unik per org, mis. `DM-2026-001`), `name` ("Sewa Ruko 12 bln"), `vendor nullable`, `control_account_id` (default 1600), `expense_account_id` (default 5300, dapat diganti mis. asuransi via `AccountSelect`), `total_minor`, `start_date`, `months (1–60)`, `monthly_minor`, `accumulated_minor default 0`, `remaining_minor default = total`, `status (ACTIVE|COMPLETED|CANCELLED)`, timestamps.

`prepaid_schedule_lines` (cermin `asset_depreciation_lines`): `contract_id, period_name (YYYY-MM), amort_date, amount_minor, accumulated_minor, remaining_minor, journal_entry_id nullable, status (SCHEDULED|POSTED)`, unique `(contract_id, period_name)`.

Pembulatan: `monthly = floor(total / months)`; selisih `total − monthly*(months−1)` ditaruh di bulan terakhir sehingga `sum == total` persis.

### 3.3 ASET_TETAP: reuse, tanpa tabel baru

Pakai `fixed_assets` + `asset_depreciation_lines` apa adanya. `TANAH` tidak dibuatkan jadwal (by design, tanah tidak disusutkan). Metode default `STRAIGHT_LINE`; `DECLINING_BALANCE` tetap didukung sebagai opsi.

### 3.4 Rekonsiliasi (kontrol vs rincian)

- `DIMUKA`: `GL(1600, POSTED saja, per normal D)` vs `SUM(remaining_minor kontrak ACTIVE)`. Selesai = selisih 0.
- `ASET_TETAP`: `GL_net = saldo(1500) + saldo(1590)` (1590 contra normal K; fungsi `signed()` yang ada sudah menangani) vs `SUM(biaya − akumulasi per aset ACTIVE + FULLY_DEPRECIATED)`. DISPOSED tidak ikut.
- Selisih > 0 → temuan HIGH `SUBLEDGER_MISMATCH` via `reportSubledgerMismatch` (muncul di `temuan`), pola sama seperti 3 kind lama.

### 3.5 Migrasi (wajib ikuti aturan repo)

- Drizzle: tulis tangan `drizzle/NNNN_*.sql` + entry `_journal.json` (JANGAN `drizzle-kit generate`: crash serialisasi BigInt). `IF NOT EXISTS`, pemisah `--> statement-breakpoint`, tanpa snapshot. Preseden: `0012_tax_summaries.sql`, `0013_kas_bank.sql`.
- SQL mentah `src/server/db/*.sql` (di-apply terurut): `FORCE RLS` + policy `org_id` untuk 2 tabel baru; tambah nilai enum ke CHECK yang relevan. `je_source_chk` milik `tax.sql` — jangan disentuh dari file lain.
- Semua `db.transaction` tenant-scoped wajib `withOrg` (`src/server/db/repos/with-org.ts`) agar lolos RLS `app_user`.
- Tambah 2 tabel ke TRUNCATE list `tests/integration/helpers.ts` atau seluruh suite integrasi pecah.
- Verifikasi koneksi dengan query nyata (Windows: `bun.exe` auto-load `.env` mengalahkan `export` shell; untuk string koneksi eksplisit pakai `node.exe`).

### 3.6 Perbaikan sajian SAK EMKM (termasuk scope)

`src/core/reports/sak-emkm.ts:58-70` menggolongkan aset по kode `<1500` lancar vs `>=1500` tetap, sehingga `1600 Sewa Dibayar di Muka` salah masuk "Aset Tetap". Perbaikan: `1600` (dan seri `16xx` beban dibayar di muka bila kelak ada) digolongkan aset lancar — aturan eksplisit: lancar = kode `<1500` ATAU (`1600`–`1699`); tetap = `1500`–`1599` (peralatan + akumulasi) serta `17xx` ke atas bila kelak ada. Diimplementasikan sebagai daftar pengecualian eksplisit + unit test, TANPA mengganti kode COA agar org lama tidak pecah.

## 4. Alur Jurnal (contoh: sewa ruko Rp12.000.000 / 12 bulan)

1. Simpan kontrak + validasi (`validate → post → immutable`): periode OPEN, akun daun, `total > 0`, `1 ≤ months ≤ 60`. Generate 12 baris `SCHEDULED` (Rp1.000.000 × 12).
2. Jurnal awal (POSTED): `Dr 1600 Rp12.000.000 / Cr 1120 Bank Rp12.000.000` + link `subledger_journal_links(kind=DIMUKA, refId=contractId)`. Nomor JE `JE-YYYY-NNNN` per-org per-periode (`journal_seq_counters` + `pg_advisory_xact_lock`).
3. Tiap bulan, tombol "Posting amortisasi" (dipilih user, bukan silent auto-post): kunci advisory → lewati baris POSTED (idempotent, aman diklik 2×) → JE `Dr 5300 Beban Sewa Rp1.000.000 / Cr 1600 Rp1.000.000` → baris jadi POSTED + `journal_entry_id` → update `accumulated/remaining` → COMPLETED saat sisa 0. Tutup-buku hanya memblokir periode CLOSED/LOCKED; tidak auto-post.
4. Aset tetap identik dengan pola yang sudah ada: perolehan `Dr 1500 / Cr Kas/Utang`, susut bulanan `Dr 5600 / Cr 1590` via "Jalankan Penyusutan"; yang baru hanya pendaftaran kind + kartu + recon.
5. Koreksi: tidak ada UPDATE ke JE POSTED. Pembatalan via JE pembalik (`reversal_of_id`); baris jadwal yang dibalik kembali ke SCHEDULED. Upload pendukung ≤5MB, mime images+pdf+csv/txt/xls/xlsx (`src/server/storage/config.ts`).

Contoh jurnal (ringkas): bayar `Dr 1600 12.000.000 / Cr 1120 12.000.000`; tiap bulan `Dr 5300 1.000.000 / Cr 1600 1.000.000` (12×). Bukan `Dr Beban langsung Rp12jt` di muka (itu kesalahan umum yang desain ini cegah).

## 5. UI (tabel beda per kind)

- `/buku-pembantu`: tambah 2 kartu ke `KIND_META` + `SUBLEDGER_LIST_ROUTE` (`src/core/subledger/cards.ts`, `page.tsx:12-16`): "Kartu Aset per Unit" (ikon `Building2`) dan "Kartu Dimuka per Kontrak" (ikon `CalendarClock`). Grid + verdict "cocok/selisih" dipakai ulang.
- `/buku-pembantu/aset`: tabel unit — kode, nama, kategori, tgl perolehan, biaya, akumulasi, **nilai buku**, status; expand per baris menampilkan jadwal susut (periode, jumlah, akumulasi, sisa, link JE, badge SCHEDULED/POSTED).
- `/buku-pembantu/dimuka` + `/[id]`: tabel kontrak — kode, nama, vendor, total, **sudah diakui**, **sisa**, progress bar, status; detail kontrak menampilkan jadwal + tombol utama terra split button `h-9 rounded-xl` + separuh chevron `border-l border-white/20` "Posting bulan ini" (pola `persediaan-client.tsx`/`NewEntryForm`).
- Chrome: `PageHeader` tiap halaman + back link di `/baru` dan `/[id]` (pola `jurnal/baru`); tabel card `rounded-xl border-rule`, thead `text-[11px] uppercase`, angka `tnum`, `Money.formatIdr`, debit `text-debit`; semua field akun memakai `AccountSelect` (`pinnedIds`, `showCreateLink`), tidak ada `<select>` native; copy Bahasa Indonesia; hormati `prefers-reduced-motion`; primitif animasi dari `src/components/motion`, impor dari `motion`/`motion/react`.
- `data-testid` baru (`subledger-nav-aset_tetap`, `subledger-nav-dimuka`, dst.) tanpa mengubah kontrak lama (`kas-bank-*`, `onboarding-*`).

## 6. Error Handling & Edge Cases

Periode CLOSED/LOCKED → tolak posting dengan pesan jelas. Baris POSTED diklik ulang → no-op sukses (idempotent). Kontrol belum dipetakan → error `KONTROL_BELUM_DIPETAKAN`. Kontrak CANCELLED → sisa jadwal dibatalkan, tidak bisa posting; pembatalan setelah sebagian POSTED wajib via reversal. Sisa pembulatan selalu di bulan terakhir. AI (`@google/genai`, model via `models.ts`, `store:true` + `previous_interaction_id`) hanya membantu draf narasi; angka selalu dari `Money`, tidak pernah dari LLM.

## 7. Testing

- Unit (`cards.ts` + helper jadwal): sisa = total − akumulasi; sum jadwal == total; bulan terakhir menampung sisa pembulatan; `TANAH` tanpa jadwal.
- Integrasi (`ledger_test`, `fileParallelism:false`): buat kontrak → jurnal awal benar; posting 2× idempotent; tolak periode CLOSED; reversal kembalikan SCHEDULED; recon DIMUKA dan ASET_TETAP cocok; RLS: org lain tidak terlihat (koneksi `app_user`).
- Mutu: `bunx tsc --noEmit` dan `bun run build` hijau; storage test skip bila S3 tak terjangkau; e2e Playwright `workers:1`, tunggu `networkidle` + hidrasi sebelum klik.

## 8. Non-tujuan (fase berikut)

Utang Bank per fasilitas (`2400` + jadwal pokok/bunga), amortisasi otomatis saat tutup buku, revaluasi aset, multi-mata uang, impor massal jadwal via xls. Tidak ada perubahan ke 3 kind lama selain penambahan enum (tidak ada migrasi merusak).
