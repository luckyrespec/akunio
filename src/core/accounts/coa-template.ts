import type { AccountDef } from "./types";

// Default Indonesian SME chart of accounts (IFRS for SMEs oriented).
export const COA_TEMPLATE: readonly AccountDef[] = [
  { code: "1000", name: "ASET", type: "ASET", normal: "D" },
  { code: "1100", name: "Kas dan Setara Kas", type: "ASET", normal: "D", parentCode: "1000" },
  { code: "1110", name: "Kas", type: "ASET", normal: "D", parentCode: "1100", isCash: true },
  { code: "1120", name: "Bank", type: "ASET", normal: "D", parentCode: "1100", isCash: true, isBank: true },
  { code: "1200", name: "Piutang Usaha", type: "ASET", normal: "D", parentCode: "1000" },
  { code: "1300", name: "Persediaan", type: "ASET", normal: "D", parentCode: "1000" },
  { code: "1400", name: "PPN Masukan", type: "ASET", normal: "D", parentCode: "1000" },
  { code: "1500", name: "Peralatan", type: "ASET", normal: "D", parentCode: "1000" },
  { code: "1590", name: "Akumulasi Penyusutan Peralatan", type: "ASET", normal: "K", parentCode: "1500", contra: true },
  { code: "1600", name: "Sewa Dibayar di Muka", type: "ASET", normal: "D", parentCode: "1000" },

  { code: "2000", name: "LIABILITAS", type: "LIABILITAS", normal: "K" },
  { code: "2100", name: "Utang Usaha", type: "LIABILITAS", normal: "K", parentCode: "2000" },
  { code: "2200", name: "PPN Keluaran", type: "LIABILITAS", normal: "K", parentCode: "2000" },
  { code: "2300", name: "Utang PPh", type: "LIABILITAS", normal: "K", parentCode: "2000" },
  { code: "2400", name: "Utang Bank", type: "LIABILITAS", normal: "K", parentCode: "2000" },

  { code: "3000", name: "EKUITAS", type: "EKUITAS", normal: "K" },
  { code: "3100", name: "Modal Disetor", type: "EKUITAS", normal: "K", parentCode: "3000" },
  { code: "3200", name: "Laba Ditahan", type: "EKUITAS", normal: "K", parentCode: "3000" },
  { code: "3300", name: "Prive", type: "EKUITAS", normal: "D", parentCode: "3000", contra: true },

  { code: "4000", name: "PENDAPATAN", type: "PENDAPATAN", normal: "K" },
  { code: "4100", name: "Pendapatan Usaha", type: "PENDAPATAN", normal: "K", parentCode: "4000" },
  { code: "4200", name: "Pendapatan Lain-lain", type: "PENDAPATAN", normal: "K", parentCode: "4000" },

  { code: "5000", name: "BEBAN", type: "BEBAN", normal: "D" },
  { code: "5100", name: "Beban Pokok Penjualan", type: "BEBAN", normal: "D", parentCode: "5000" },
  { code: "5200", name: "Beban Gaji", type: "BEBAN", normal: "D", parentCode: "5000" },
  { code: "5300", name: "Beban Sewa", type: "BEBAN", normal: "D", parentCode: "5000" },
  { code: "5400", name: "Beban Utilitas", type: "BEBAN", normal: "D", parentCode: "5000" },
  { code: "5500", name: "Beban Transportasi", type: "BEBAN", normal: "D", parentCode: "5000" },
  { code: "5600", name: "Beban Penyusutan", type: "BEBAN", normal: "D", parentCode: "5000" },
  { code: "5700", name: "Beban Pajak", type: "BEBAN", normal: "D", parentCode: "5000" },
  { code: "5900", name: "Beban Lain-lain", type: "BEBAN", normal: "D", parentCode: "5000" },
];
