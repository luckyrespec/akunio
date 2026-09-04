# Spec: Dedicated Page `/faktur/baru` + 2 Template Cetak

- Tanggal: 2026-09-04
- Status: APPROVED (user), siap implementasi
- Pendahulu: spec `2026-09-04-aset-baru-design.md` (pola sama)

## 1. Keputusan (disetujui user)

1. Rute tunggal `/faktur/baru?tipe=invoice|bill` untuk faktur penjualan & tagihan pembelian.
2. Toggle *"Langsung posting ke jurnal"* default ON (gagal posting → faktur tetap unposted + peringatan).
3. 2 template cetak: Formal + Modern, switcher di halaman detail, preferensi `localStorage`.

## 2. Temuan cek halaman faktur

- Buat via dialog 650px (`create-invoice-dialog.tsx`): item sempit, tanpa preview dokumen.
- Buat faktur = subledger saja (`createInvoiceRepo` tanpa jurnal); posting via
  `postInvoiceToJournalAction` → `postInvoiceToLedger`; pembayaran auto-jurnal
  (`recordInvoicePaymentAction autoPostToLedger=true`).
- 1 template cetak (`invoice-print-view.tsx`) di `/faktur/[id]`.

## 3. File

| File | Peran |
|---|---|
| `src/app/(app)/faktur/baru/page.tsx` | Server: kontak + `tipe`; render client |
| `src/app/(app)/faktur/baru/faktur-baru-client.tsx` | Form + preview dokumen live + ringkasan jurnal |
| `src/server/actions/invoice.actions.ts` | `createInvoiceWithPostingAction` (buat + posting berurutan, fallback unposted) |
| `src/components/invoicing/invoice-document.tsx` (baru) | Data-view bersama (header/kop/item/total) untuk preview + cetak |
| `src/components/invoicing/template-formal.tsx` + `template-modern.tsx` | 2 template cetak |
| `src/components/invoicing/invoice-print-view.tsx` | Jadi switcher (segmented + `localStorage`) + aksi cetak/WA/bayar |
| `src/components/invoicing/invoice-dashboard.tsx` | Tombol → `Link /faktur/baru?tipe=…`; hapus dialog |
| `src/components/invoicing/create-invoice-dialog.tsx` | HAPUS |
| `tests/integration/invoice-posting-acq.test.ts` (baru) | Buat + posting → Dr Piutang / Cr Pendapatan+PPN |

## 4. Aturan

- Item: `calculateInvoiceTotals` (ada, teruji); validasi deskripsi + harga per baris.
- Nomor auto `INV-/BILL-YYYY-NNNN` (repo); jatuh tempo = termin kontak.
- Posting memakai `postInvoiceToLedger` yang ada (mapping akun AR/AP otomatis);
  preview jurnal menampilkan label generik + nominal live.
- Sukses → `router.push(/faktur/{id})`.
- Cetak: kedua template hormati `@media print` terang; data sama, presentasi beda.

## 5. UI/Motion

- shadcn: Card penuh, **Table** untuk item, Badge, Button terra+Loader2, Separator;
  `gap-*`, `size-*`, `data-icon`, `cn()`.
- Motion: Stagger section, AnimatePresence + `layout` tambah/hapus baris,
  AnimatedNumber total, token ease-out, reduced-motion via primitif.

## 6. Verifikasi

- `bunx tsc --noEmit`, `bun run build`, `bun run test` (termasuk test baru).
- Feel: baris item tambah/hapus mulus; preview update live; Ctrl+P kedua template rapi;
  e2e buat → detail → bayar.
