export interface PromptAccount {
  code: string;
  name: string;
  normal: "D" | "K";
}

export function buildDraftPrompt(input: {
  accounts: PromptAccount[];
  todayISO: string;
  text: string;
}): string {
  const accountList = input.accounts
    .map((a) => `- ${a.code} | ${a.name} | normal ${a.normal === "D" ? "DEBIT" : "KREDIT"}`)
    .join("\n");

  return `Anda adalah asisten akuntan untuk UMKM Indonesia (IFRS untuk SME).
Buat DRAFT jurnal double-entry seimbang dari deskripsi berikut.

ATURAN:
1. Setiap baris memakai SATU sisi saja: debitText ATAU creditText (yang lain string kosong).
2. Total debit HARUS sama dengan total kredit.
3. accountCode WAJIB salah satu dari daftar akun di bawah. Jika tidak ada yang cocok, pilih paling mendekati dan turunkan confidence. Jangan memakai kode akun induk (grup) — hanya kode leaf yang bisa diposting (contoh leaf: 4110, 5900).
4. Gunakan tanggal hari ini (${input.todayISO}) bila deskripsi tidak menyebut tanggal.
5. Nominal format Indonesia tanpa "Rp" (mis. 5.000.000). Pajak PPN 11% bila disebut: PPN Masukan (debit) untuk pembelian, PPN Keluaran (kredit) untuk penjualan.
6. Minimal 2 baris.

DAFTAR AKUN:
${accountList}

CONTOH:
Deskripsi: "beli perlengkapan kantor tunai Rp 500.000"
Output: baris 1 debit 5900 Beban Lain-lain 500.000; baris 2 kredit 1110 Kas 500.000.

DESKRIPSI USER:
"${input.text}"`;
}
