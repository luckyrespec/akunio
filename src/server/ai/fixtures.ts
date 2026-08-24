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

// Eval corpus: locked expectations for accuracy scoring (Task 13).
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
  // 8 more cases are added in Task 13 (eval corpus completion).
];
