import { COA_TEMPLATE } from "./coa-template";
import { DEFAULT_NORMAL, type AccountDef, type AccountType } from "./types";
import type { BusinessType } from "./business-types";

export const COA_EXTRAS: Record<BusinessType, AccountDef[]> = {
  DAGANG: [
    { code: "1310", name: "Persediaan Barang Dagang", type: "ASET", normal: "D", parentCode: "1300" },
    { code: "4110", name: "Penjualan Barang", type: "PENDAPATAN", normal: "K", parentCode: "4100" },
    { code: "4120", name: "Retur & Potongan Penjualan", type: "PENDAPATAN", normal: "D", parentCode: "4100", contra: true },
    { code: "5120", name: "Ongkos Angkut Pembelian", type: "BEBAN", normal: "D", parentCode: "5100" },
  ],
  JASA: [
    { code: "4130", name: "Pendapatan Jasa", type: "PENDAPATAN", normal: "K", parentCode: "4100" },
    { code: "5210", name: "Beban Subkontraktor", type: "BEBAN", normal: "D", parentCode: "5200" },
    { code: "5410", name: "Beban Internet & Komunikasi", type: "BEBAN", normal: "D", parentCode: "5400" },
    { code: "5510", name: "Beban Perjalanan Dinas", type: "BEBAN", normal: "D", parentCode: "5500" },
  ],
  KULINER: [
    { code: "1340", name: "Persediaan Bahan Baku", type: "ASET", normal: "D", parentCode: "1300" },
    { code: "1350", name: "Persediaan Kemasan", type: "ASET", normal: "D", parentCode: "1300" },
    { code: "4150", name: "Pendapatan Makanan & Minuman", type: "PENDAPATAN", normal: "K", parentCode: "4100" },
    { code: "5140", name: "Beban Bahan Baku", type: "BEBAN", normal: "D", parentCode: "5100" },
    { code: "5150", name: "Beban Komisi Delivery", type: "BEBAN", normal: "D", parentCode: "5100" },
  ],
  MANUFAKTUR: [
    { code: "1360", name: "Persediaan Bahan Baku", type: "ASET", normal: "D", parentCode: "1300" },
    { code: "1370", name: "Barang Dalam Proses", type: "ASET", normal: "D", parentCode: "1300" },
    { code: "1380", name: "Persediaan Barang Jadi", type: "ASET", normal: "D", parentCode: "1300" },
    { code: "5160", name: "Beban Overhead Pabrik", type: "BEBAN", normal: "D", parentCode: "5100" },
    { code: "5170", name: "Beban Tenaga Kerja Langsung", type: "BEBAN", normal: "D", parentCode: "5100" },
  ],
  ONLINE_RESALE: [
    { code: "1390", name: "Persediaan Toko Online", type: "ASET", normal: "D", parentCode: "1300" },
    { code: "4160", name: "Penjualan Online", type: "PENDAPATAN", normal: "K", parentCode: "4100" },
    { code: "4170", name: "Retur Penjualan Online", type: "PENDAPATAN", normal: "D", parentCode: "4100", contra: true },
    { code: "5180", name: "Beban Komisi Marketplace", type: "BEBAN", normal: "D", parentCode: "5100" },
    { code: "5520", name: "Beban Ongkir & Packing", type: "BEBAN", normal: "D", parentCode: "5500" },
  ],
  KOS_PROPERTI: [
    { code: "1700", name: "Bangunan & Properti Sewa", type: "ASET", normal: "D", parentCode: "1000" },
    { code: "1710", name: "Akumulasi Penyusutan Bangunan", type: "ASET", normal: "K", parentCode: "1700", contra: true },
    { code: "2500", name: "Uang Deposito Penyewa", type: "LIABILITAS", normal: "K", parentCode: "2000" },
    { code: "4180", name: "Pendapatan Sewa", type: "PENDAPATAN", normal: "K", parentCode: "4100" },
    { code: "5310", name: "Beban Perawatan & Perbaikan", type: "BEBAN", normal: "D", parentCode: "5300" },
  ],
};

export function coaForBusinessType(t: BusinessType): AccountDef[] {
  return [...COA_TEMPLATE, ...COA_EXTRAS[t]];
}

export function validateCoaDefs(defs: AccountDef[]): string[] {
  const errors: string[] = [];
  const codes = new Set(defs.map((d) => d.code));
  for (const d of defs) {
    if (!/^\d{4}$/.test(d.code)) errors.push(`Kode tidak valid: ${d.code}`);
    if (!d.name.trim()) errors.push(`Nama kosong untuk kode ${d.code}`);
    if (d.normal !== DEFAULT_NORMAL[d.type] && !d.contra)
      errors.push(`Saldo normal salah: ${d.code} ${d.name}`);
    if (d.parentCode && !codes.has(d.parentCode))
      errors.push(`Induk hilang ${d.parentCode} untuk ${d.code}`);
    if (d.code.length > 8) errors.push(`Kode terlalu panjang: ${d.code}`);
  }
  const dupes = defs.map((d) => d.code).filter((c, i, a) => a.indexOf(c) !== i);
  for (const c of new Set(dupes)) errors.push(`Kode ganda: ${c}`);
  return errors;
}

const TYPE_PREFIXES: Array<{ re: RegExp; type: AccountType }> = [
  { re: /^(beban|biaya|ongkos|gaji|iklan|listrik|air|telepon|internet|transport|komisi|pajak\b)/i, type: "BEBAN" },
  { re: /^(pendapatan|penjualan|omzet)/i, type: "PENDAPATAN" },
  { re: /^(kas|bank|tabungan)/i, type: "ASET" },
  { re: /^(utang|hutang|pinjaman|kewajiban)/i, type: "LIABILITAS" },
  { re: /^(modal|ekuitas|prive|laba)/i, type: "EKUITAS" },
  { re: /^(persediaan|peralatan|aset|aktiva|gedung|bangunan|tanah|kendaraan|inventaris|deposito\b)/i, type: "ASET" },
];

export function inferAccountType(name: string): AccountType | null {
  const n = name.trim();
  for (const { re, type } of TYPE_PREFIXES) {
    if (re.test(n)) return type;
  }
  return null;
}

const TYPE_RANGES: Record<AccountType, { from: number; to: number }> = {
  ASET: { from: 1000, to: 1999 },
  LIABILITAS: { from: 2000, to: 2999 },
  EKUITAS: { from: 3000, to: 3999 },
  PENDAPATAN: { from: 4000, to: 4999 },
  BEBAN: { from: 5000, to: 5999 },
};

export function suggestAccountCode(defs: AccountDef[], type: AccountType): string {
  const used = new Set(defs.map((d) => d.code));
  const { from, to } = TYPE_RANGES[type];
  for (let n = from; n <= to; n++) {
    const code = String(n);
    if (!used.has(code)) return code;
  }
  throw new Error(`Tidak ada kode kosong untuk tipe ${type}.`);
}
