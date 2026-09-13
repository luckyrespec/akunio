# Spec: Remediasi Audit Logika Akuntansi — Input → Jurnal → Laporan

Tanggal: 2026-09-13. Pendekatan: **A. Lapis fondasi ke atas** (disetujui).
Scope: **satu spec besar**, ~30 temuan dari 2 audit end-to-end (2026-09-12 dan 2026-09-13).

## Keputusan yang dikunci

1. **Scope**: satu spec mencakup semua temuan (core, laporan, kas-bank/faktur/POS, persediaan, aset/dimuka/pajak, baseline hijau).
2. **DB**: bebas diubah bahkan reset (masih dev, belum live). Syarat: backup RAG SAK-EMKM di-seed ulang via `scripts/export-rag-sak.mjs --import backups/rag-sak-emkm-<file>.json`; user `kerjaanlucky@gmail.com` dipertahankan (uji coba).
3. **Definisi selesai**: seluruh suite hijau **termasuk 9 baseline merah** (6 isolasi-RLS, 2 storage, 1 registry NARA).
4. **Sumber temuan**: audit `postDraftEntry` tanpa validasi, `signed()` abaikan contra, rekonsiliasi sertakan DRAFT, numbering faktur/AST tanpa lock, double-submit kas-bank/pelunasan, FIFO opname vs average, jalur Rp0 bypass periode, disposal pincang, kartu `/laporan` Between-vs-Through, arus-kas plug, tutup-tahun rapuh, `withOrg` bocor, HITL 100x, AI payment tanpa posting.

## Out of scope (eksplisit, bukan kelalaian)

- **Engine tahun fiskal non-kalender**: skema punya `fiscalYearStartMonth` (`src/server/db/schema/org.ts:9`) tapi seluruh logika hardcode Desember. Tidak dibangun; sebagai gantinya guard fail-closed (tutup tahun menolak bila bulan awal fiskal ≠ Januari, pesan jelas) + dokumentasi.
- **Engine HPP PERIODIC intra-tahun**: tidak dibangun; tambah catatan UI di penjualan/persediaan bahwa laba kotor PERIODIC baru benar setelah penyesuaian akhir tahun.
- **Sumber jurnal baru**: tidak ada nilai `source` baru; taksonomi 12 nilai di `src/server/db/tax.sql:28-30` dipertahankan.

---

## Section 1 — Fondasi DB & primitif posting (disetujui)

**Tujuan**: satu sumber kebenaran untuk invariansi, penomoran anti-race, idempotency anti-klik-ganda, uang eksak.

1. **CHECK `je_source_chk`**: hapus duplikat sempit di `src/server/db/hardening.sql:9-11`; kanonis hanya `src/server/db/tax.sql:28-30`. Tambah komentar kepemilikan di kedua file.
2. **Counter baru** pola POS (`pg_advisory_xact_lock` + tabel counter, lih. `src/server/db/repos/pos.repo.ts:62-74`):
   - `invoice_seq_counters(org_id, year, type)`; `getNextInvoiceNumberRepo` (`src/server/db/repos/invoices.repo.ts:42-71`) dipindah ke dalam transaksi pemanggil.
   - `ast_seq_counters(org_id, year)`; kode `AST-YYYY-NNNN` reset tiap tahun (samakan perilaku `DM-YYYY-NNNN` di `src/server/db/repos/prepaid.repo.ts:46-58`).
   - Lock untuk penomoran `DM-YYYY-NNNN`.
3. **Trigger**: `guard_journal_lines` (`src/server/db/triggers.sql:16-33`) cek `OLD.entry_id` juga (tutup loophole pindah baris keluar POSTED via `UPDATE ... SET entry_id=<draft>`). `reversal_of_id` (`src/server/db/schema/journal.ts:26`) jadi FK ke `journal_entries.id`.
4. **`postDraftEntry`** (`src/server/db/repos/journals.repo.ts:522-562`) wajib panggil `validateEntry` + `checkPostingAccounts` sebelum flip, dan `ORDER BY position` saat load baris draf (samakan `assemble`). Ekstrak helper `nextJournalNumber` bersama untuk `postJournalEntry`/`createDraftJournalEntry` (gap nomor oleh draf tak-terposting didokumentasikan sebagai wajar).
5. **Idempotency**: semua form (kas-bank, pelunasan, faktur, aset) generate `idempotencyKey` per submit (preceden `kasir-shell.tsx:139`); unique-violation `je_org_idem_uq` dipetakan ke return-existing, bukan PG error mentah; `reverseEntryAction` (`src/server/actions/journal.actions.ts:83-114`) cek reversal existing dulu (hormati `je_reversal_once_uq` di `hardening.sql:3-4`).
6. **Reversal**: `makeReversal` (`src/core/journals/validate.ts:84-97`) warisi `source` asli + mirror `subledgerLinks` (lolos `assertSubledgerControl` modul); error modul melempar `PostingError` (bukan `Error` biasa) agar tak tertelan `fail()`.
7. **Uang**: unifikasi ke `toMinor`/`Money.parseIdr` sekali di server (`src/server/db/repos/journals.repo.ts:73-86`, `src/core/money/money.ts`). Ganti semua `parseFloat(x)*100`: `reconciliation.repo.ts:59-60,279-280`, `periods-closing.repo.ts:97-98,183-190`, `record-payment-dialog.tsx:54,73,88`, `faktur-baru-client.tsx:89-91`. Perbaiki HITL 100x (`nara-hitl-approval-card.tsx:321` → `Money.fromMinor(total).formatIdr()`). Tambah batas atas nominal di `validateEntry` (kapasitas `numeric(18,2)`).
8. **RLS**: sediakan peran `app_user` non-bypass (prosedur manual via Neon Console — control plane menolak password lemah dan tak bisa cabut BYPASSRLS tanpa superuser); `withOrg` (`src/server/db/repos/with-org.ts`) di semua tulis faktur (`invoice.actions.ts`), aset (`assets.actions.ts`), dan semua baca laporan/dasbor (saat ini `db.transaction` mentah).

**Error handling**: kode `PostingError` Bahasa Indonesia tunggal (unifikasi `PERIODE_TUTUP` vs `PERIOD_NOT_OPEN`); typo `SUBLEDGER_KIND_TIDAK_COCok` (`guard.ts:22`) diperbaiki.
**Testing**: regression test tiap poin (draf tak-balance ditolak, double-submit kembali existing, reversal modul lolos guard, RLS `app_user` menolak lintas-org).

---

## Section 2 — Modul operasional (disetujui)

1. **Kas-bank**: key per submit; `postCashDraftRepo` idempoten dipertahankan.
2. **Pelunasan faktur** (`src/server/db/repos/invoices.repo.ts:206-255`, `src/server/invoicing/posting.ts:629-724`): tolak `amountMinor<=0`, akun kas wajib, tolak overpayment melebihi sisa; tulis baris log `kas_bank_entries` ke JE yang sama (preceden POS `pos.repo.ts:244-260`) agar daftar Kas konsisten; source tetap `DOCUMENT`.
3. **AI `record_invoice_payment`** (`src/server/invoicing/tools.ts:205-263`): ikut panggil `postInvoicePaymentToLedger` (samakan default auto-post UI).
4. **Faktur**: pakai counter Section 1; kembalikan `revalidatePath("/persediaan/jasa")` yang terhapus di `invoice.actions.ts` lama `:61,74`.
5. **POS** (`src/server/db/repos/pos.repo.ts`): jalur idempoten kembalikan `journalNumber` asli (bukan `""`, `:97`); atribusi `unitCostMinor` per baris by-index (bukan `find` pertama, `:283`); `closeShift` (`:434-479`) pakai advisory lock; picker akun selisih kecualikan akun kontrol (`!isCash` saja tak cukup); `transferMinor` keluar dari ekspektasi laci tunai.
6. **AI** (`src/server/ai/`): simpan `previousInteractionId` per thread untuk `journal-chat.ts:112` (preceden `nara.ts:306-339`); client legacy `slice(-6)` → `-12` (`journal-chat-client.tsx:44`); model-id via `models.ts` (hapus 4 hardcode); contoh prompt `5100`/`4100` diganti kode leaf postable (`prompt.ts:32`); `resolveDraftAccounts` (`core/ai/map-accounts.ts:31-32`) tandai GROUP/arsip `unresolved`+warning dini; `review-client.tsx` `resetToAi` reset `rows`.

**Testing**: double-submit kas/pelunasan, overpayment ditolak, AI payment muncul di ledger, dupe POS kembalikan nomor sama, tutup shift konkuren satu draf, threading chat 12 pesan.

---

## Section 3 — Persediaan + Aset/Dimuka (disetujui)

**Persediaan** (`src/server/db/repos/inventory.repo.ts`):
1. Opname FIFO dinilai per-layer (defisit konsumsi layer tertua via `consumeFifoLayers`, surplus bikin layer baru di `unitCost` terhitung) bukan `physical × average` (`:746-757,774-807`); org average tetap WAC.
2. Jalur Rp0 (`:913-935`) wajib periode OPEN + `lockInventoryPolicy` (kasus migrasi tetap boleh + disclosure `[Tanpa jurnal...]` dipertahankan).
3. `postOpnameAdjustment` baca ulang `averageCost` dalam lock; snapshot basi → abort `STOK_BERUBAH` (perluas guard `:738` dari qty ke cost).
4. `setItemActive` (`:322-324`): syarat `qty==0` DAN `totalCostMinor==0`; sisa pembulatan wajib write-off via opname.
5. `updateOpnameItemCost` (`:819-862`): string kosong = pertahankan, bukan 0.
6. `cancelStockOpname` (`:1097-1141`): hapus objek S3 yatim (best-effort) selain baris DB; `listItemCostHistory` (`:265`) tampilkan OUT/ADJUSTMENT.

**Aset/Dimuka**:
7. Counter+lock AST (reset tahunan), lock DM (Section 1).
8. `postMonthlyDepreciation` (`assets.repo.ts:195-321`) + jurnal tutup tahun (`periods-closing.repo.ts:200-212`): source `AI`→`MANUAL` bermemo jelas + advisory lock per org-periode.
9. `disposeAsset` (`:323-433`, `core/assets/disposal.ts`): `SALE`+`proceeds>0` wajib `depositAccountId` (validasi UI+server); tolak bila ada line `SCHEDULED` sebelum tanggal lepas (paksa posting susut dulu).
10. AI `register_fixed_asset` (`assets-closing.tools.ts:359`): ikut jurnal perolehan (default true, jalur atomik `createAssetWithAcquisitionAction`) atau status `belum-dijurnal` eksplisit di kartu.

**Testing**: opname FIFO vs layer, Rp0 di periode CLOSED ditolak, stale-cost abort, disposal tanpa kas ditolak, susut konkuren satu jurnal, AI asset muncul di GL.

---

## Section 4 — Laporan SAK EMKM + tutup buku (disetujui)

1. `signed()` (`src/core/reports/aggregates.ts:42-47`) hormati `contra` + regression test (retur `4120/4170`, akumulasi `1590/1710`, prive `3300`).
2. Rekonsiliasi (`reconciliation.repo.ts:41-54,236-282`): filter `status='POSTED'` + `toMinor`.
3. Kartu Total Aset/Ekuitas/Kas di `laporan/page.tsx:49-62` pakai `postedLinesThrough` (kumulatif, samakan `neraca/page.tsx:36`); kartu L/R tetap YTD. Drilldown (`reports/drilldown.ts:89-145`) neto via `signed()`. Dasbor kas `Through(today)` (bukan 31 Des) + aktivitas POSTED-only (`dasbor/page.tsx:58-91`).
4. Arus kas (`arus-kas/page.tsx:46-65`): petakan prefix hilang (utang pendek, pajak, dimuka); residu hanya untuk unmapped + flag Doctor bila material.
5. Tutup tahun (`periods-closing.repo.ts:110-232`, `core/periods/closing-journal.ts`): tutup saldo **bertanda** (hapus filter `>0n`) termasuk prive `33xx`; agregat per-periode (bukan `LIKE 'YYYY%'`); hapus param mati `incomeSummaryAccountId` (tutup langsung ke Laba Ditahan, didokumentasikan satu-tahap); `closePeriod` verifikasi `isReady` di server; reopen Desember dikunci sampai jurnal penutup direversal; guard tolak fiskal non-Januari. Tambah catatan UI "pasca tutup buku" untuk L/R Desember ≈ nol.
6. Rapian: label `Periode Berjalan` tunggal (ganti `Tahun Berjalan` di `sak-emkm.ts:106`); `KartuAkunPage` (`buku-pembantu/laba-rugi/[id]/page.tsx:33-41`) hanya 404 untuk tak-ditemukan, DB error dilempar; ganti `idByCode.get()!` (`pl-data.ts:83`) dengan bucket fallback; filter `from` ledger di SQL (`ledger.repo.ts:38,65`); filter org dua sisi (`build.ts`, `ledger.repo.ts`); `deletePeriodAction` cek org.

**Testing**: fixture laporan ber-contra, recon abaikan DRAFT, kartu index == halaman detail, arus kas residual nol pada fixture, tutup-buku e2e (temp nol, ditahan naik, reopen terkunci).

---

## Section 5 — Baseline hijau + testing/rollout (disetujui)

1. **6 merah RLS**: suite isolasi-RLS pindah ke PG docker lokal (`docker-compose.yml`, `db` pg16+pgvector, host 54329) di mana superuser tersedia untuk cabut BYPASSRLS; suite lain tetap cabang Neon `vitest`/`ledger_test`. Pisahkan via file test + env `TEST_RLS_DATABASE_URL`.
2. **2 merah storage**: konfigurasi S3 SeaweedFS terima `demo/demo` (file `s3.config` untuk `weed server -s3` di `scripts/weed-dev.cmd`; data dir `D:\Lucky\weed_strorage\data` tak boleh dihapus); pastikan bucket `neraca-docs` via `scripts/weed-ensure-bucket.mjs`. Probe-gate `SKIP_STORAGE_TESTS` dipertahankan.
3. **1 merah registry NARA** (`tests/unit/ai/nara-tools-registry.test.ts`): satukan ke satu registry (nama→{def, handler}) agar tak bisa drift di tree kotor; test mengunci single-source, bukan cross-check dua list.
4. **Playbook reset dev** (perluas `scripts/reset-dev.mjs`, flag `--confirm` dipertahankan):
   - Backup: `bun scripts/export-rag-sak.mjs` → `backups/rag-sak-emkm-<ts>.json` (+ `db:vectors:backup` untuk `ifrs_chunks`).
   - Reset: TRUNCATE kecuali `PRESERVE` + daftar-kecualikan user uji (seluruh org/membership/profil milik `kerjaanlucky@gmail.com` dipertahankan — saat ini skrip me-TRUNCATE semua org).
   - Reseed: migrate + `db:sql` + `export-rag-sak.mjs --import` + verifikasi count RAG (gagal bila berubah, preceden cek `reset-dev.mjs:62-65`).
5. **Gate per fase Section 1→5**: `bunx tsc --noEmit`, `bun run build`, `bun run test`, `bun run e2e` (workers:1, prasyarat `:3000` bersih + branch E2E dimigrasi). Cek integritas baru jadi Doctor check: trial-balance nol per periode, kontrol↔pembantu (aset, dimuka, piutang, utang, persediaan) cocok.

## Urutan implementasi

Section 1 → 2 → 3 → 4 → 5, gate hijau tiap section sebelum lanjut. Estimasi diisi saat planning (writing-plans).
