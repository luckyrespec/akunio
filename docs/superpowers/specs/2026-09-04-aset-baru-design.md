# Spec: Halaman Dedicated "Tambah Aset" (`/aset/baru`)

- Tanggal: 2026-09-04
- Status: APPROVED (user), siap implementasi
- Peluang terkait: `plans/001–006` DONE (token, Reveal/Stagger, AnimatePresence)

## 1. Latar & temuan

Form tambah aset hari ini adalah dialog (`src/app/(app)/aset/create-asset-dialog.tsx`, 344 baris, 12+ field) — sempit (`max-w-2xl`), tidak ada pratinjau dampak akuntansi.

Temuan audit jurnal (terverifikasi di kode, bukan asumsi):
- `createFixedAssetAction` (`src/server/actions/assets.actions.ts:58-86`) + `createFixedAsset`
  (`src/server/db/repos/assets.repo.ts:30-105`) **TIDAK memposting jurnal perolehan** —
  hanya insert aset + jadwal susut. Label audit `"JOURNAL_POST"` (:79) menyesatkan.
- Penyusutan bulanan (`assets.repo.ts:231-276`) dan pelepasan (`:340-364`) **sudah**
  otomatis terjurnal via `postJournalEntry`.
- Dampak: aset Rp15jt terdaftar → neraca tidak bergerak sampai user jurnal manual.

## 2. Keputusan desain (disetujui user)

1. **Jurnal perolehan otomatis + dropdown akun lawan** — Ekuitas/Modal (migrasi saldo
   awal), Kas & Bank (tunai), Utang (kredit). User memilih via dropdown.
2. **Layout satu halaman + panel live** (bukan wizard).
3. Rute `/aset/baru` mengikuti pola `/jurnal/baru`.

## 3. Arsitektur & file

| File | Peran |
|---|---|
| `src/app/(app)/aset/baru/page.tsx` | Server page: `requireContext(["OWNER","ACCOUNTANT"])`, load akun (id/code/name/type/isCash/isBank/parentCode), render `PageHeader` + form client |
| `src/app/(app)/aset/baru/aset-baru-client.tsx` | `"use client"`: form + panel pratinjau live (pola route-local seperti `aset-client.tsx`) |
| `src/core/assets/acquisition.ts` (baru) | Pure builder garis jurnal perolehan → unit-testable |
| `tests/unit/acquisition.test.ts` (baru) | Test builder (tanpa DB) |
| `src/server/actions/assets.actions.ts` | Action baru `createAssetWithAcquisitionAction` (transaksi atomik) |
| `src/app/(app)/aset/aset-client.tsx` | Tombol "+ Tambah Aset" → `Link /aset/baru`; hapus state dialog |
| `src/app/(app)/aset/create-asset-dialog.tsx` | HAPUS (mencegah duplikasi logika) |

## 4. Alur data & aturan akuntansi

1. Client kirim payload dialog-lama + `postAcquisition: boolean` + `counterAccountId`.
2. Server dalam **satu transaksi**: `createFixedAsset` → jika `postAcquisition`,
   `postJournalEntry({ dateISO: acquisitionDate, memo: "Perolehan aset {code} — {name}", lines: [Dr akunAset 15xx, Cr akunLawan], source: "MANUAL", idempotencyKey: "asset-acq-{assetId}" })`.
3. Gagal jurnal (periode terkunci/tutup, akun tak-postable) → rollback penuh, error di Alert form.
4. TANAH: section susut disembunyikan (AnimatePresence); `usefulLifeMonths: 0`;
   repo sudah skip jadwal untuk TANAH (`assets.repo.ts:78`). Jurnal perolehan tetap diposting.
5. Akun lawan: hanya akun leaf (tanpa anak, pola `jurnal/baru`), dikelompokkan
   Kas & Bank (`isCash||isBank`) / Utang (`type` liabilitas) / Ekuitas–Modal / Lainnya.
6. Sukses → `router.push(/aset/{newId})` (halaman detail).

## 5. UI (shadcn + Paper & Ink)

- Grid `lg:grid-cols-[1fr_360px]`; kiri 3 `Card` (Header/Title/Description/Content penuh):
  1. Informasi Aset (nama + Rekomendasi Cerdas SAK EMKM dipertahankan, kategori Badge-able, tgl, harga, residu, catatan).
  2. Penyusutan (metode select, masa manfaat + helper tahun/bulan, tarif kondisional).
  3. Jurnal Perolehan (checkbox styled + select akun lawan + mapping 3 akun COA).
- `Separator` antar section; `Alert` error; validasi `required` + `aria-invalid`.
- Select native styled (konvensi repo; combobox searchable = backlog, butuh CLI online).
- Copy Bahasa Indonesia; `tnum` untuk angka; `Money` BigInt minor, tidak ada `number` untuk amount.

## 6. Motion (standar 001–006 + motion/react)

- `Stagger` antar section + `Reveal` panel (exemplar `dasbor/page.tsx`).
- `AnimatePresence initial={false}` untuk tarif declining & section TANAH & panel preview.
- `AnimatedNumber` beban/bulan; entrance `y12/duration .4/ease-out-soft`; interaksi ≤240ms.
- `useReducedMotion` via primitif; tanpa `transition-all`; import dari `motion/react`.

## 7. Verifikasi

- `bunx tsc --noEmit` hijau; `bun run build` hijau; `bun run test` (termasuk test baru).
- Feel: entrance stagger; spam toggle TANAH/metode tidak restart; panel preview update <1 frame kasar;
  reduced-motion statis-terbaca; e2e buat aset → muncul di `/aset`, `/jurnal`, dan neraca bergerak.

## 8. Non-goal

- Edit/hapus aset dari halaman ini; impor massal; foto/lampiran aset; combobox searchable;
  ubah logika penyusutan/pelepasan yang sudah berjalan.
