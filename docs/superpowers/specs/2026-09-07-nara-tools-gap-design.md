# Spec: Tool Nara untuk Modul yang Belum Tercakup

Tanggal: 2026-09-07 · Jalur: architectural (pendekatan A disetujui) · Status: menunggu review

## 1. Latar & Tujuan

Audit tool Agent (`src/server/ai/nara-tools.ts`, 31 tool) menemukan modul tanpa tool
(kontak), modul sebagian (buku pembantu, kas-bank entries, faktur, aset), dan satu
inkonsistensi (`add_service_item` terdaftar di definisi tapi tercecer dari
`SAFE_TOOLS`/`MUTATING_TOOLS` sehingga selalu jatuh ke approval manual).

Tujuan: lengkapi cakupan tool agar Agent bisa menjawab dan bertindak di semua modul
operasional, tanpa mengubah mekanisme HITL, keamanan tenant, atau UX chat.

## 2. Pendekatan (disetujui)

Ikut batas modul yang ada: file `*.tools.ts` baru per modul, perluas file sekeluarga
untuk yang serumpun. Registry (`nara-tools.ts`), set SAFE/MUTATING, dan system prompt
diperbarui. Tidak ada mekanisme baru.

## 3. Daftar Tool Final (disetujui)

Semua parameter mengikuti signature repo yang ada. Uang BigInt minor via `Money`.

### 3.1 Baru: `contacts.tools.ts` (repo `contacts.repo.ts`)

| Tool | Kelas | Parameter |
|---|---|---|
| `list_contacts` | SAFE | `type` (CUSTOMER/VENDOR/ALL), `search` |
| `find_contact` | SAFE | `name` atau `contactId` — resolusi sebelum mutasi/drilldown |
| `create_contact` | MUTATING | `type` + `name` wajib, sisanya ikut `CreateContactInput` |
| `update_contact` | MUTATING | `contactId` + field `UpdateContactInput` |

Handler kontak memakai `db` langsung (signature repo `Db`-based, scoping `orgId`
sudah di dalam query repo).

### 3.2 Baru: `subsidiary.tools.ts` (repo `subsidiary.repo.ts`, semua SAFE)

| Tool | Sumber |
|---|---|
| `list_contact_ledgers` | `listContactCards`, `type` INVOICE/BILL |
| `get_contact_ledger` | `getContactCard` per `contactId` + `type` |
| `get_item_stock_card` | `getItemCard` per barang |

### 3.3 Baru: `cash-bank.tools.ts` (repo `cash-bank.repo.ts`)

| Tool | Kelas | Catatan |
|---|---|---|
| `list_cash_entries` | SAFE | filter tipe/kata kunci, cap ~50 baris |
| `get_cash_summary` | SAFE | posisi kas untuk pertanyaan saldo |
| `record_cash_entry` | MUTATING | pembayaran/penerimaan/transfer; WAJIB lewat `createCashEntryRepo` → `postCashDraftRepo`, tidak boleh insert langsung |

### 3.4 Perluasan sekeluarga

| File | Tambahan |
|---|---|
| `invoicing.tools.ts` | `list_invoices`, `get_invoice_detail` (SAFE) |
| `inventory.tools.ts` | `list_stock_opnames` (SAFE), `create_stock_opname` (MUTATING, berhenti di draf — pengesahan tetap di UI) |
| `assets-closing.tools.ts` | `list_fixed_assets` (SAFE), `register_fixed_asset` (MUTATING, ikut `createFixedAsset`) |

### 3.5 Perbaikan set

`add_service_item` masuk `MUTATING_TOOLS`. Aturan SAK tetap tanpa tool (RAG
server-side, by design).

## 4. Kebijakan HITL & Keamanan (disetujui)

- 11 tool read → `SAFE_TOOLS` (auto-execute). 5 tool mutating → `MUTATING_TOOLS`
  (kartu persetujuan; pengecualian `autonomous`/`allowAllForSession` tak berubah).
- Handler `Queryable`-based lewat `withOrg` (pola `inventory.tools.ts`); RLS
  dibuktikan lolos di test integrasi.
- Tool read mengembalikan ringkasan + cap baris, bukan dump tabel (hemat token,
  tahan prompt injection via data).
- Dua langkah yang tidak boleh dipintas: create→post kas-bank, draf opname.

## 5. Perubahan System Prompt (disetujui)

Blok Daftar Tool di `src/app/api/nara/chat/stream/route.ts` tambah satu grup per
modul baru berisi kapan-memanggil-apa, mis. kontak → `find_contact` dulu sebelum
`update_contact`; buku pembantu → `get_contact_ledger` untuk sisa tagihan per
kontak; kas-bank → `record_cash_entry` (bukan `post_journal` mentah). Aturan
anti-lupa 12 pesan dan gaya bahasa tidak diubah. Tanpa perubahan UI/UX chat;
`data-testid` Playwright tetap.

## 6. Testing (disetujui)

- Tiap file tool baru/perluasan: test integrasi DB lokal `ledger_test`
  (pola `rag-toggle.test.ts`): satu happy-path + satu kegagalan
  (kontak tak ketemu, opname tanpa item, kas-bank akun tak valid).
- Satu test registry: setiap nama di `SAFE_TOOLS`/`MUTATING_TOOLS` wajib punya
  handler terdaftar (mencegah kasus `add_service_item` terulang).
- E2E satu skenario asap: tanya posisi kas → tool terpanggil → jawaban tampil.
  E2E existing tidak tersentuh.

## 7. Di Luar Cakupan

Hapus/ubah faktur, dispose aset via Agent, posting opname via Agent, tool SAK
sebagai function call, perubahan widget/halaman asisten, perubahan skema DB
dan migrasi (semua memakai repo + tabel yang sudah ada).
