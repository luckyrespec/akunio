# Modul Kas & Bank — Design Spec

Tanggal: 2026-09-06
Status: Disetujui (pendekatan B)
Referensi: https://www.acisindonesia.com/modul-kas-bank-pada-accurate-online/

## 1. Latar & Tujuan

Accurate Online punya modul Kas & Bank: Pembayaran, Penerimaan,
Transfer Bank, Smartlink, Rekening Koran, Histori Bank, Rekonsiliasi.
Akunio mengadopsi polanya, disederhanakan untuk SAK EMKM 2024 dan
user awam akuntansi.

Tujuan: user yang tidak paham jurnal tetap bisa catat kas lewat
form sederhana (jembatan selain Asisten AI). Setiap simpan otomatis
jadi jurnal seimbang via alur `validate → post → immutable` yang ada.

Non-tujuan (v1): Smartlink / integrasi internet banking (butuh API bank).

## 2. Scope v1

Lengkap tanpa Smartlink, semua dedicated page:

| Route baru | Fungsi |
|---|---|
| `/kas-bank/pembayaran` | Kas keluar single-baris |
| `/kas-bank/penerimaan` | Kas masuk single-baris |
| `/kas-bank/transfer` | Pindah Kas ↔ Bank |
| `/kas-bank/histori` | Mutasi buku kas/bank + saldo berjalan (read-only) |
| `/kas-bank/rekonsiliasi` | Pindahan halaman rekonsiliasi saat ini |

`/rekonsiliasi` dipertahankan sebagai redirect permanen.
Sidebar: parent `Kas & Bank` (expand/collapse) + 5 anak di grup Operasional.

## 3. Jenis Transaksi (SAK EMKM, single lawan akun)

Form single-baris: 1 akun Kas/Bank + 1 akun lawan + nominal.
Akun lawan bebas pilih, dengan template cepat:

- Bayar: Beban 5xxx, Gaji 5200, Utang Usaha 2100, Prive 3300,
  beli persediaan tunai 13xx, pajak 5700.
- Terima: Pendapatan Usaha 41xx, Pendapatan Lain 4200
  (bunga bank / jasa giro), Piutang 1200, Modal Disetor 3100.
- Transfer: Kas 1110 ↔ Bank 112x. Dukung sub-rekening bank
  (1121 BCA, 1122 Mandiri, dst — user boleh tambah via COA).

Kontak (supplier/pelanggan) opsional, hanya info.

## 4. Arsitektur Data

### 4.1 Tabel baru `kas_bank_entries`

Satu baris per transaksi, link ke satu journal entry (2 lines):

- `id uuid PK`, `org_id uuid FK → organizations`
- `kind text: BAYAR | TERIMA | TRANSFER`
- `entry_date date`, `cash_account_id uuid FK → accounts`
- `counter_account_id uuid FK → accounts`
  (untuk TRANSFER: `cash_account_id` = asal, `counter_account_id` = tujuan,
  keduanya wajib `is_cash = true`)
- `contact_id uuid nullable FK → contacts`
- `amount_minor bigint` (Rp minor, `Money.parseIdr`, > 0)
- `memo text`, `number text` (BBK/BBM/TKB)
- `journal_entry_id uuid nullable FK → journal_entries`
- `status text mirror: DRAFT | POSTED`
- `created_by text`, `created_at / updated_at timestamptz`

RLS: `FORCE RLS` + policy per `org_id` seperti tabel tenant lain;
akses app wajib lewat `withOrg` (`app.current_org`) karena pool
`app_user`. Index: `(org_id, entry_date)`, `(org_id, kind)`.

Histori TIDAK pakai tabel baru — query `journal_lines` JOIN
`journal_entries` POSTED untuk akun `is_cash`, hitung saldo
berjalan di JS dengan BigInt minor.

### 4.2 Jurnal yang dibentuk

- Bayar: `Dr lawan (Beban/Utang/...) / Kr Kas-Bank`.
- Terima: `Dr Kas-Bank / Kr lawan (Pendapatan/Piutang/Modal/...)`.
- Transfer: `Dr Kas-Bank tujuan / Kr Kas-Bank asal`.
- `source` jurnal: tambah enum `KAS_BAYAR, KAS_TERIMA, KAS_TRANSFER`
  (migrasi enum, default tetap MANUAL untuk lama).
- Validasi pakai `validateEntry + checkPostingAccounts` yang ada:
  akun se-org, tidak diarsip, bukan induk, periode OPEN,
  debit = kredit, nominal > 0.

### 4.3 Nomor bukti

Terpisah dari `JE-YYYY-NNNN` (nomor jurnal tetap jalan seperti biasa):

- `BBK-YYYY-NNNN` (bayar), `BBM-YYYY-NNNN` (terima),
  `TKB-YYYY-NNNN` (transfer). Year-scoped per org.
- Counter `kas_bank_seq_counters (org_id, year, kind, last)` +
  `pg_advisory_xact_lock` mengikuti pola `journals.repo.ts`.

## 5. Alur Simpan (data flow)

1. Client validasi ringan (tanggal, nominal, akun terisi, asal ≠ tujuan).
2. Server action dalam `db.transaction + withOrg`:
   `findPeriodByDate` → tolak jika CLOSED/LOCKED →
   buat/post journal (DRAFT atau POSTED) → insert
   `kas_bank_entries` → commit.
3. Split button: primer `Simpan & Posting` (POSTED langsung),
   dropdown `Simpan Draft` (DRAFT, bisa diposting dari list
   Kas-Bank atau Jurnal Umum).
4. POSTED immutable: trigger `forbid_posted_mutation` tetap berlaku;
   koreksi via jurnal pembalik (`reversal_of_id`), entri kas-bank
   tidak bisa diedit/hapus setelah POSTED.
5. `revalidatePath` ke list modul + histori + buku besar.

## 6. UX per Halaman

- List + form dalam satu dedicated page per submodul
  (pola meniru `InvoiceDashboard`): tabel (tanggal, nomor, kas,
  lawan, kontak, nominal, status, link jurnal) + dialog form.
- Form Bayar/Terima: picker Kas/Bank (hanya `is_cash`),
  picker lawan (semua akun daun + template cepat), tanggal,
  nominal IDR, kontak opsional, memo, lampiran opsional (ikut
  pola dokumen yang ada bila murah, boleh ditunda).
- Form Transfer: picker asal + tujuan (keduanya `is_cash`,
  validasi beda akun), tanggal, nominal, memo.
- Histori: filter akun kas/bank + rentang tanggal, tabel mutasi
  (tanggal, keterangan, masuk, keluar, saldo berjalan),
  total masuk/keluar, link ke jurnal, tombol lompat ke rekonsiliasi.
- Copy Bahasa Indonesia, token Paper & Ink yang ada, hormati
  `prefers-reduced-motion`. Tidak ada animasi baru.

## 7. Error Handling

- Periode tutup/terkunci → tolak dengan pesan jelas.
- Nominal nol/negatif, akun sama (transfer), akun induk/arsip,
  kontak beda org → tolak validasi, tidak ada jurnal setengah jadi
  (atomic transaction).
- Race nomor → lock per (org, year, kind); konflik idempotency
  → kembalikan entri yang sudah ada.

## 8. Testing

- Vitest integrasi (`ledger_test`, `guardTestDb`):
  bayar beban POSTED membentuk jurnal seimbang;
  terima pendapatan DRAFT lalu posting;
  transfer menolak akun sama / bukan kas;
  histori menghitung saldo berjalan benar;
  RLS menolak akses lintas org.
- E2E Playwright (AI_MOCK=1): bayar → muncul di jurnal + histori;
  sidebar anak menu aktif di tiap route; `/rekonsiliasi` redirect.

## 9. Rollout

1. Migrasi: enum source + tabel + counter + RLS (`src/server/db/*.sql`).
2. Repo + actions + validasi Money.
3. 3 halaman transaksi + histori.
4. Pindah rekonsiliasi + redirect + sidebar collapsible.
5. Test hijau: `bunx tsc --noEmit`, `bun run test`, `bun run build`.
