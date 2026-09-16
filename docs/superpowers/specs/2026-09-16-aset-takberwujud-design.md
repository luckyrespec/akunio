# Desain: Modul Aset Takberwujud (SAK EMKM Bab 12)

Tanggal: 2026-09-16. Jalur: architectural. Status: disetujui per seksi, menunggu review spek.

## Latar & Keputusan Induk

- Lisensi/software adalah **aset takberwujud (Bab 12)**, bukan aset tetap (Bab 11) — modul terpisah, bukan kategori baru.
- Pendekatan: **tabel terpisah, cermin penuh aset tetap** (bukan generalisasi kolom `jenis`, bukan mesin generik).
- Kategori **fixed 6**: LISENSI_SOFTWARE, HAK_CIPTA, PATEN, MEREK_DAGANG, GOODWILL, LAINNYA.
- Amortisasi **garis lurus saja** (satu-satunya penyimpangan dari "cermin penuh").
- Menu sendiri "Aset Takberwujud" (`/aset-takberwujud`), bukan submenu.
- Fase 2 (di luar spek ini): kategori dinamis via drawer + fallback Uncategorized.

## Seksi 1 — Data & Skema (disetujui)

- `intangible_assets`: `id, org_id, code (ITB-YYYY-NNNN), name, category` (enum 6 di atas),
  `acquisition_date, acquisition_cost_minor, useful_life_months (> 0, CHECK), amortization_method`
  (nilai `'STRAIGHT_LINE'`, kolom disiapkan), `asset_account_id, accumulated_account_id,`
  `expense_account_id, notes, status (AKTIF/SELESAI/DILEPAS)`.
- `amortization_lines`: `asset_id, period_name (YYYY-MM), amort_date, amount_minor,`
  `accumulated_minor, remaining_minor, status (SCHEDULED/POSTED), journal_entry_id`.
- Tanpa kolom residu (dianggap nol, Bab 12). Tanpa padanan "tanah".
- Akun dipilih user dari COA yang ada (tidak ada auto-create akun; kelola akun tetap di Pengaturan/COA).
- RLS + `org_id` mengikuti pola `rls.sql`. Migrasi: lane Drizzle (hand-written SQL + journal,
  preseden `0021–0024`); CHECK/policy mentah bila perlu via `*.sql` terurut.

## Seksi 2 — Server (disetujui)

- `intangible-assets.repo.ts` (baru, meniru `assets.repo.ts`):
  - `createIntangible` — counter `ITB-YYYY-NNNN` + `pg_advisory_xact_lock`, wajib dalam transaksi pemanggil.
  - `listIntangibles`, `getIntangibleDetail` (aset + jadwal).
  - `postMonthlyAmortization` — ambil line SCHEDULED per `periodName` → `postJournalEntry`
    (Dr beban amortisasi / Cr akumulasi amortisasi) → tandai POSTED + simpan `journal_entry_id`; idempoten.
  - `disposeIntangible` — hentikan sisa jadwal + jurnal pelepasan (meniru `disposeAsset`).
  - Semua query tenant-scoped via `withOrg(orgId, …)`; signature `withOrg(orgId, fn)`.
- `intangible.actions.ts` (file baru, bukan menumpuk `assets.actions.ts`):
  `createIntangibleWithAcquisitionAction`, `recommendIntangibleSakAction`.
  Uang sebagai string digit minor di batas client→action; parse rupiah tepat sekali.
- AI `server/ai/intangible-recommend.ts` (meniru `asset-recommend.ts`):
  - RAG **Bab 12** via `getSakChapterByBab(12)` (cap ±8000 char; gagal RAG → lanjut tanpa konteks).
  - Model via `models.ts` (default flash-lite); tidak hardcode; tidak thinking model.
  - Interactions API `store:false`, JSON Schema + zod, retry 2.
  - Output: `{category (enum 6), usefulLifeMonths, analysis (ID, rujuk Bab 12), sakRef}`.
    `usefulLifeMonths` 1–600 (clamp). Kategori user dikirim dan boleh dikoreksi LLM.
  - Tanpa API key / `AI_MOCK=1` / gagal total → fallback heuristik kata kunci
    (lisensi/software/merek/paten/cipta/goodwill) + analisis jujur berlabel luring.
- Jadwal garis lurus murni: `amount = cost / months`, sisa pembulatan ke bulan terakhir
  (fungsi baru ±50 baris, bukan cabang dari `calculateDepreciationSchedule`).

## Seksi 3 — UI (disetujui)

- Sidebar grup Akuntansi: item "Aset Takberwujud" (ikon dokumen/lisensi, beda dari Aset Tetap).
  Rute `/aset-takberwujud`, `/baru`, `/[id]`.
- `/baru`: kartu Informasi + Amortisasi + Jurnal Perolehan Otomatis. Tanpa field residu,
  tanpa opsi saldo menurun, tanpa cabang tanah. Tombol Rekomendasi Cerdas SAK EMKM di kartu
  Amortisasi + panel analisis (badge "SAK EMKM Bab 12" / "Mode luring"), pola `aset-baru-client`.
- Daftar: `DataTable` + `FilterDrawer` sejak awal (kolom Kode, Nama, Kategori, Tgl Perolehan,
  Biaya, Akumulasi, Nilai Buku, Status; filter search + status). `getRowId`, footer total.
- Detail `[id]`: ringkasan + meter progres + tabel jadwal + posting bulan berjalan.
  Tanpa panel komposisi kategori.
- Copy Bahasa Indonesia; token Paper & Ink; `prefers-reduced-motion` dihormati.
- Sitasi SAK (`SakRuleSheet`) menunjuk Bab 12 bila ditambahkan nanti.

## Testing

- Unit: rekomendasi heuristik + jalur SAK luring (`AI_MOCK=1`, hermetik, meniru
  `asset-recommend-sak.test.ts`); jadwal garis lurus (pembulatan bulan terakhir).
- Integration: lifecycle buat → posting 1 bulan → lepas (meniru `asset-lifecycle.test.ts`);
  TRUNCATE list `helpers.ts` ditambah tabel baru.
- `bunx tsc --noEmit` + `bun run build` hijau sebelum selesai.

## Di Luar Cakupan

- Kategori dinamis + Uncategorized (fase 2). Saldo menurun. Impor CSV.
  Akun COA otomatis. Amortisasi parsial tengah bulan (penuh 1 bulan seperti aset tetap).
