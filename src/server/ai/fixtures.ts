import type { DraftEntry } from "./schema";

export const MOCK_TEXT_DRAFT: DraftEntry = {
  dateISO: "2026-01-15",
  memo: "Pembelian perlengkapan kantor tunai",
  lines: [
    {
      accountCode: "5900",
      debitText: "500.000",
      creditText: "",
      confidence: 0.9,
      reason: "Pembelian perlengkapan dicatat sebagai beban",
    },
    {
      accountCode: "1110",
      debitText: "",
      creditText: "500.000",
      confidence: 0.95,
      reason: "Dibayar tunai mengurangi Kas",
    },
  ],
  overallConfidence: 0.92,
  explanation: "Pembelian perlengkapan dicatat sebagai beban, dibayar tunai dari Kas.",
};

export const MOCK_DOCUMENT_DRAFT: DraftEntry = {
  dateISO: "2026-01-15",
  memo: "Faktur PT Sumber Rejeki",
  lines: [
    {
      accountCode: "1300",
      debitText: "1.000.000",
      creditText: "",
      confidence: 0.85,
      reason: "Faktur pembelian barang",
    },
    {
      accountCode: "1400",
      debitText: "110.000",
      creditText: "",
      confidence: 0.8,
      reason: "PPN Masukan 11%",
    },
    {
      accountCode: "2100",
      debitText: "",
      creditText: "1.110.000",
      confidence: 0.9,
      reason: "Pembelian kredit ke Utang Usaha",
    },
  ],
  overallConfidence: 0.85,
  explanation: "Faktur pembelian kredit dengan PPN Masukan 11%.",
};

// Eval corpus: locked expectations for accuracy scoring (10 balanced cases).
export const EVAL_CASES: Array<{ name: string; input: string; expected: DraftEntry }> = [
  {
    name: "beli perlengkapan tunai",
    input: "beli perlengkapan kantor tunai Rp 500.000",
    expected: MOCK_TEXT_DRAFT,
  },
  {
    name: "faktur pembelian kredit ppn",
    input: "terima faktur PT Sumber Rejeki barang 1.000.000 plus PPN, belum dibayar",
    expected: MOCK_DOCUMENT_DRAFT,
  },
  {
    name: "bayar gaji bulan ini",
    input: "bayar gaji karyawan bulan ini 5 juta tunai",
    expected: {
      dateISO: "2026-01-15", memo: "Pembayaran gaji karyawan bulan ini",
      lines: [
        { accountCode: "5200", debitText: "5.000.000", creditText: "", confidence: 0.9, reason: "Beban gaji" },
        { accountCode: "1110", debitText: "", creditText: "5.000.000", confidence: 0.95, reason: "Dibayar tunai" },
      ],
      overallConfidence: 0.92, explanation: "Pembayaran gaji dicatat sebagai beban, dibayar tunai.",
    },
  },
  {
    name: "setoran modal",
    input: "terima setoran modal pemilik 10 juta ke bank",
    expected: {
      dateISO: "2026-01-15", memo: "Setoran modal pemilik",
      lines: [
        { accountCode: "1120", debitText: "10.000.000", creditText: "", confidence: 0.95, reason: "Dana masuk ke bank" },
        { accountCode: "3100", debitText: "", creditText: "10.000.000", confidence: 0.95, reason: "Tambahan modal disetor" },
      ],
      overallConfidence: 0.95, explanation: "Setoran modal menambah Bank dan Ekuitas.",
    },
  },
  {
    name: "jual barang tunai",
    input: "jual barang tunai 2 juta",
    expected: {
      dateISO: "2026-01-15", memo: "Penjualan barang tunai",
      lines: [
        { accountCode: "1110", debitText: "2.000.000", creditText: "", confidence: 0.9, reason: "Penerimaan kas" },
        { accountCode: "4200", debitText: "", creditText: "2.000.000", confidence: 0.9, reason: "Pendapatan lain-lain" },
      ],
      overallConfidence: 0.9, explanation: "Penjualan tunai menambah Kas dan Pendapatan.",
    },
  },
  {
    name: "bayar sewa kantor",
    input: "bayar sewa kantor 3 bulan 15 juta via bank",
    expected: {
      dateISO: "2026-01-15", memo: "Pembayaran sewa kantor 3 bulan",
      lines: [
        { accountCode: "5300", debitText: "15.000.000", creditText: "", confidence: 0.85, reason: "Beban sewa" },
        { accountCode: "1120", debitText: "", creditText: "15.000.000", confidence: 0.9, reason: "Dibayar via bank" },
      ],
      overallConfidence: 0.87, explanation: "Pembayaran sewa dicatat sebagai beban, dari Bank.",
    },
  },
  {
    name: "beli peralatan kredit bank",
    input: "beli peralatan komputer 8 juta dengan kredit bank",
    expected: {
      dateISO: "2026-01-15", memo: "Pembelian peralatan komputer secara kredit",
      lines: [
        { accountCode: "1500", debitText: "8.000.000", creditText: "", confidence: 0.9, reason: "Peralatan bertambah" },
        { accountCode: "2400", debitText: "", creditText: "8.000.000", confidence: 0.9, reason: "Kredit bank" },
      ],
      overallConfidence: 0.9, explanation: "Pembelian peralatan dicatat sebagai aset, dibayar dengan utang bank.",
    },
  },
  {
    name: "bayar listrik",
    input: "bayar listrik kantor 750 ribu tunai",
    expected: {
      dateISO: "2026-01-15", memo: "Pembayaran listrik kantor",
      lines: [
        { accountCode: "5400", debitText: "750.000", creditText: "", confidence: 0.9, reason: "Beban utilitas" },
        { accountCode: "1110", debitText: "", creditText: "750.000", confidence: 0.95, reason: "Dibayar tunai" },
      ],
      overallConfidence: 0.92, explanation: "Pembayaran listrik dicatat sebagai beban, dibayar tunai.",
    },
  },
  {
    name: "prive pemilik",
    input: "pemilik ambil uang untuk keperluan pribadi 1 juta dari bank",
    expected: {
      dateISO: "2026-01-15", memo: "Penarikan pribadi pemilik (prive)",
      lines: [
        { accountCode: "3300", debitText: "1.000.000", creditText: "", confidence: 0.85, reason: "Prive mengurangi ekuitas" },
        { accountCode: "1120", debitText: "", creditText: "1.000.000", confidence: 0.9, reason: "Dari rekening bank" },
      ],
      overallConfidence: 0.87, explanation: "Penarikan pribadi dicatat sebagai prive, mengurangi Bank.",
    },
  },
  {
    name: "jual barang termasuk ppn",
    input: "jual barang 11 juta tunai termasuk PPN",
    expected: {
      dateISO: "2026-01-15", memo: "Penjualan barang tunai termasuk PPN 11%",
      lines: [
        { accountCode: "1110", debitText: "11.000.000", creditText: "", confidence: 0.9, reason: "Total penerimaan kas" },
        { accountCode: "4200", debitText: "", creditText: "10.000.000", confidence: 0.85, reason: "Nilai penjualan sebelum PPN" },
        { accountCode: "2200", debitText: "", creditText: "1.000.000", confidence: 0.85, reason: "PPN Keluaran 11%" },
      ],
      overallConfidence: 0.88, explanation: "Penjualan 10 juta + PPN Keluaran 1 juta, diterima tunai 11 juta.",
    },
  },
];
