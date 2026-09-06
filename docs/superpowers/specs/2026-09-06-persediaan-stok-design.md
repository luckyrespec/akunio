# Desain: Persediaan split menu + SKU/barcode otomatis + thumbnail + foto via asisten

Tanggal: 2026-09-06
Status: disetujui per-section via brainstorming (arsitektural)
Keputusan kunci: pisah penuh, SKU `BRG-urut`, satu foto + kompres client, opt-in manual asisten, 3 kolom kode pisah.

## 1. Latar & tujuan

Modul persediaan saat ini satu halaman gabungan (`/persediaan` overview + `/persediaan/opname` terpisah tanpa parent menu),
tidak konsisten dengan pola Kas & Bank (parent + children). Selain itu:
- `inventory_items.code` (SKU) dan `barcode` (pabrik) diisi manual → rawan duplikat/typo, tidak ada kode app pendek untuk scan.
- Belum ada foto barang; tambah via asisten tidak bisa memakai foto upload user.
- Target: navigasi child-menu ala Kas & Bank, SKU/app-barcode auto pendek anti-duplikat, satu thumbnail ≤500KB,
  dan foto upload asisten bisa jadi thumbnail via opt-in eksplisit.

## 2. Navigasi & routes (pisah penuh, tanpa overview gabungan)

- Sidebar (`src/components/sidebar-nav.tsx`): `Persediaan & Stok` menjadi parent (`ParentNavItem`,
  `match: p.startsWith("/persediaan")`), children:
  - `Daftar Barang` → `/persediaan/daftar`
  - `Stok Opname` → `/persediaan/opname`
- Pindahan file:
  - `persediaan/page.tsx` + `persediaan-client.tsx` → `/persediaan/daftar/` (tambah kolom Foto + App-barcode di tabel,
    search ikut mencakup `app_barcode`).
  - `/persediaan/baru` (+ `/batch`) → `/persediaan/daftar/baru` (+ `/batch`).
  - `/persediaan/[id]` → `/persediaan/daftar/[id]`.
  - Opname tetap di `/persediaan/opname/...`; back-link "Kembali ke Master" diarahkan ke `/persediaan/daftar`.
- `/persediaan` menjadi `redirect("/persediaan/daftar")`.
  Redirect permanen tambahan: `/persediaan/baru*` → `/persediaan/daftar/baru*`, `/persediaan/[id]` lama → path baru.
- Tiap child punya `PageHeader` sendiri (pola `kas-bank/pembayaran/page.tsx`); tidak ada tab internal.
- `inventory.actions.ts`: semua `revalidatePath("/persediaan")` lama dilengkapi path baru
  (`/persediaan/daftar`, `/persediaan/daftar/[id]`, `/persediaan/opname`).

## 3. SKU / app-barcode / barcode pabrik + anti-duplikasi

Skema akhir `inventory_items` (3 kolom kode):

| Kolom | Isi | Unik? | Input |
|---|---|---|---|
| `code` | SKU app human-readable `BRG-0001` | unique per org (existing) | auto + editable |
| `app_barcode` (baru) | 8 digit numerik `2xxxxxxx` untuk scan (Code128) | unique per org | auto + editable |
| `barcode` (lama) | barcode pabrik mis. `899...` | tidak unik | manual opsional |

- Generator: tabel baru `inventory_sku_counters(org_id PK, last_seq)`. Dalam satu transaksi `withOrg`
  + `pg_advisory_xact_lock(hashtext('sku:{orgId}'))`: `seq = last_seq + 1` →
  `code = 'BRG-' || lpad(seq, 4, '0')` (seq > 9999 menjadi `BRG-10000` dst) dan
  `app_barcode = 20000000 + seq` (range internal agar tak tabrakan EAN pabrik; ≤8 char).
- Anti-duplikasi 3 lapis: (1) lock + counter untuk race concurrent; (2) `uniqueIndex(org, code)` (existing)
  + `uniqueIndex(org, app_barcode)` (baru) — pelanggaran DB dipetakan ke pesan ramah;
  (3) validasi client + 1x retry generate-ulang bila race lolos.
- UX form (`daftar/baru`, batch grid, dialog): tiap field SKU/app-barcode ada tombol Generate
  (isi saran, tetap bisa diedit manual). Kosong saat submit = server auto-isi.
  Batch: baris tanpa kode ikut auto-urut; duplikat dalam batch ditolak per-baris (pola existing).
- AI tools (`src/server/ai/tools/inventory.tools.ts`): `code`/`appBarcode` menjadi opsional
  (required tinggal `name`); kosong → server auto-generate; respons kembalikan ketiga kode.
  `list_inventory_items` ikut menampilkan `appBarcode`. Prompt konfirmasi ikut menanyakan kode bila user memberi manual.
- Detail barang (`daftar/[id]`): tampilkan ketiga kode + render visual Code128 dari `app_barcode`
  via komponen client kecil (`jsbarcode` → SVG, hanya di detail agar list tetap ringan).
- Data lama: `app_barcode` nullable; UI tampilkan "-" + aksi Generate per-baris (lazy, tanpa backfill massal paksa).

## 4. Thumbnail persediaan (satu foto, maks 500KB)

- Skema: `image_storage_key text NULL` + `image_mime varchar(32) NULL` di `inventory_items`.
  Hapus foto = set NULL + hapus objek S3 best-effort.
- Storage: reuse SeaweedFS bucket yang sama; key `orgs/{orgId}/inventory/{itemId}/{uuid}.jpg`
  via helper `putInventoryImage` (pola `putDocument` di `src/server/storage/storage.ts`).
  Serve via endpoint dokumen yang ada; daftar pakai `<img loading="lazy">` 32px rounded,
  detail 240px; fallback ikon `Package` bila NULL.
- Kompres client (wajib): input `accept="image/jpeg,image/png,image/webp"` → canvas sisi terpanjang maks 1024px
  → export JPEG/WebP quality menurun (0.9 → 0.6) sampai ≤500KB; bila tetap lebih, tolak dengan pesan.
  Server validasi ulang: tolak bila `>500KB` atau MIME bukan gambar (subset `ALLOWED_MIMES`, tanpa PDF/CSV).
- Foto tidak tampil di kartu stok/mutasi (tetap teks). Upload/hapus hanya OWNER/ACCOUNTANT.
  Ganti foto menghapus objek lama best-effort agar bucket tidak bocor.

## 5. Foto via asisten (opt-in manual)

- Alur: user lampirkan foto + minta tambah barang → LLM wajib tanya dulu
  "Jadikan foto `nama-file.jpg` sebagai thumbnail?" — tanpa "ya" eksplisit, barang dibuat tanpa foto
  (mengikuti pola konfirmasi tool existing).
- >1 foto dalam thread: asisten daftarkan file dan minta pilih salah satu; tidak asal ambil yang terakhir.
- Batch AI tidak dukung foto (arahkan upload manual via halaman barang).
- Teknis: param opsional baru `imageDocumentId` hanya di `add_inventory_item`.
  Handler: ambil buffer dokumen milik org dari SeaweedFS → validasi MIME gambar + ≤500KB
  → salin ke key inventory + set kolom gambar. Bila `>500KB`: barang tetap dibuat tanpa foto
  + pesan "Foto melebihi 500KB — buka detail barang untuk upload versi kompres otomatis".
  Dokumen asli di `documents` tetap sebagai arsip chat.

## 6. Migrasi, RLS & testing

- Migrasi dua jalur: Drizzle hand-written `drizzle/0014_inventory-sku-image.sql`
  (tabel counter + kolom + unique index; `IF NOT EXISTS`, `--> statement-breakpoint`, entri `_journal.json`,
  tanpa snapshot) + raw `src/server/db/*.sql` terurut untuk CHECK
  (`app_barcode ~ '^[0-9]{8}$'`, MIME gambar) dan RLS/`FORCE RLS` tabel counter.
  `je_source_chk` (milik `tax.sql`) tidak disentuh.
- `TRUNCATE` di `tests/integration/helpers.ts` ditambah `inventory_sku_counters`.
  Semua transaksi tenant baru lewat `withOrg` agar lolos RLS `app_user`.
- Testing:
  - Vitest: generator konkuren tak duplikat; unique violation → pesan ramah; tolak gambar >500KB/MIME non-gambar;
    tool AI tanpa foto sukses, dengan `imageDocumentId` valid menjadi thumbnail.
  - Playwright (workers:1): navigasi parent/children; tambah barang + Generate; upload thumbnail terkompres;
    alur opt-in asisten. Kontrak `data-testid` baru `persediaan-*`; `kas-bank-*`/`onboarding-*` tidak diubah.

## 7. Non-tujuan (YAGNI)

- Multi-foto per barang (skema single-thumbnail; naik kelas ke tabel `inventory_images` bila dibutuhkan nanti).
- Cetak label barcode fisik / integrasi scanner hardware.
- Kompres server-side (`sharp`) — ditolak agar tanpa dep baru; bila aturan berubah, handler asisten yang pertama membutuhkannya.
- Backfill massal `app_barcode` data lama.
