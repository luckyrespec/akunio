import { Money } from "@/core/money/money";

// Bingkai koreksi deterministik untuk mesin koreksi berlandaskan SAK EMKM.
// Semua builder di file ini murni (tanpa DB): nominal SELALU berasal dari
// argumen sebagai bigint; satu-satunya konstanta nominal adalah NOL.
// Kode akun keluaran berupa `accountCode`; resolusi ke ID akun dikerjakan
// orkestrator (Task 7) via `resolveDraftAccounts` agar builder tetap murni.

export type CorrectionStrategy = "REVERSAL" | "RECLASS" | "CUTOFF" | "SUMMARY_ONLY";

export interface CorrectionFrameLine {
  accountCode: string;
  debitMinor: bigint;
  creditMinor: bigint;
  memo: string;
}

export interface CorrectionFrame {
  lines: CorrectionFrameLine[];
  reversalOfId: string | null;
  strategy: CorrectionStrategy;
  // Memo tingkat draf (Bahasa Indonesia). Sengaja ditambahkan di luar
  // tiga medan plan agar bingkai CUTOFF/SUMMARY_ONLY yang tanpa lines
  // tetap membawa "memo pindah periode" / ringkasan untuk draf.
  memo: string;
}

// R1: tipe usulan akun baru diekspor dari sini untuk dipakai Task 8.
export type AccountProposal = {
  code: string;
  name: string;
  type: "ASET" | "LIABILITAS" | "EKUITAS" | "PENDAPATAN" | "BEBAN";
  normal: "D" | "K";
  parentCode: string;
  reason: string;
};

// Default eksplisit per tipe untuk builder abnormal: bila tak ada info akun
// asal, sisi lawan reklasifikasi ditampung di 3100 Modal Disetor.
// Ini default yang didokumentasikan, bukan tebakan umum — orkestrator boleh
// menggantinya bila mengetahui akun lawan yang sebenarnya.
const DEFAULT_EQUITY_COUNTERPART_CODE = "3100";

function requireCode(code: string, error: string): string {
  const trimmed = code.trim();
  if (trimmed.length === 0) throw new Error(error);
  return trimmed;
}

function requirePositiveAmount(amountMinor: bigint): bigint {
  if (amountMinor <= 0n) throw new Error("KOREKSI_NOMINAL_TIDAK_VALID");
  return amountMinor;
}

// Duplikat: jurnal pembalik (reversal) — cerminkan setiap baris D↔K
// dengan nominal persis sama, dan tautkan ke entri yang dibalik.
export function buildDuplicateCorrection(entry: {
  id: string;
  memo: string;
  lines: Array<{ accountCode: string; debitMinor: bigint; creditMinor: bigint }>;
}): CorrectionFrame {
  const id = requireCode(entry.id, "KOREKSI_ENTRI_TIDAK_VALID");
  if (entry.lines.length === 0) throw new Error("KOREKSI_ENTRI_TIDAK_VALID");
  return {
    lines: entry.lines.map((l) => ({
      accountCode: requireCode(l.accountCode, "KOREKSI_AKUN_TIDAK_VALID"),
      debitMinor: l.creditMinor,
      creditMinor: l.debitMinor,
      memo: entry.memo,
    })),
    reversalOfId: id,
    strategy: "REVERSAL",
    memo: `Pembalik Transaksi Duplikat: ${entry.memo}`,
  };
}

// Saldo abnormal: keluarkan porsi abnormal dari akun via reklasifikasi.
// normal "D" (saldo abnormal di sisi kredit): debit akun, kredit 3100.
// normal "K" (saldo abnormal di sisi debit): kredit akun, debit 3100.
export function buildAbnormalCorrection(
  code: string,
  abnormalMinor: bigint,
  normal: "D" | "K",
): CorrectionFrame {
  const accountCode = requireCode(code, "KOREKSI_AKUN_TIDAK_VALID");
  const amountMinor = requirePositiveAmount(abnormalMinor);
  const memo = `Reklasifikasi saldo abnormal akun ${accountCode}`;
  const lines: CorrectionFrameLine[] =
    normal === "D"
      ? [
          { accountCode, debitMinor: amountMinor, creditMinor: 0n, memo },
          { accountCode: DEFAULT_EQUITY_COUNTERPART_CODE, debitMinor: 0n, creditMinor: amountMinor, memo },
        ]
      : [
          { accountCode, debitMinor: 0n, creditMinor: amountMinor, memo },
          { accountCode: DEFAULT_EQUITY_COUNTERPART_CODE, debitMinor: amountMinor, creditMinor: 0n, memo },
        ];
  return { lines, reversalOfId: null, strategy: "RECLASS", memo };
}

// Bukti belum ada: parkir jumlah tak terdokumentasi ke akun penampung dari
// COA org (BUKAN kode fiktif — caller wajib mengoper kode yang sudah
// ter-resolve, mis. 1600 lalu 1200; kosong → throw).
// Keterbatasan jujur: builder hanya menerima satu kode, sehingga baris kredit
// memakai akun penampung yang sama sebagai penyeimbang net-nol — orkestrator
// WAJIB menggantinya dengan kode akun beban asal dari entri temuan sebelum
// posting (atau memblokir posting sampai pengguna memilih). Diposting apa
// adanya pun bingkai ini netral terhadap saldo (D=K pada akun yang sama).
export function buildMissingReceiptCorrection(
  amountMinor: bigint,
  suspenseCode: string,
): CorrectionFrame {
  const amount = requirePositiveAmount(amountMinor);
  const code = requireCode(suspenseCode, "AKUN_PENAMPUNG_TIDAK_ADA");
  const memo = `Reklasifikasi ke akun penampung ${code} — menunggu dokumen pendukung`;
  return {
    lines: [
      { accountCode: code, debitMinor: amount, creditMinor: 0n, memo },
      {
        accountCode: code,
        debitMinor: 0n,
        creditMinor: amount,
        memo: "Penyeimbang sementara — ganti dengan akun beban asal dari entri temuan",
      },
    ],
    reversalOfId: null,
    strategy: "RECLASS",
    memo,
  };
}

// Tanggal ganjil: tanpa jurnal lawan — tanggal ditangani saat posting ke
// periode terbuka; bingkai hanya membawa strategi CUTOFF + memo pindah periode.
export function buildOddDateCorrection(
  entry: { id: string; number: string; entryDate: string },
  openPeriod: { startsOn: string; endsOn: string },
): CorrectionFrame {
  const number = requireCode(entry.number, "KOREKSI_ENTRI_TIDAK_VALID");
  const entryDate = requireCode(entry.entryDate, "KOREKSI_ENTRI_TIDAK_VALID");
  const startsOn = requireCode(openPeriod.startsOn, "KOREKSI_PERIODE_TIDAK_VALID");
  const endsOn = requireCode(openPeriod.endsOn, "KOREKSI_PERIODE_TIDAK_VALID");
  return {
    lines: [],
    reversalOfId: null,
    strategy: "CUTOFF",
    memo: `Pindah periode: ${number} tanggal ${entryDate} ke periode terbuka ${startsOn}–${endsOn}`,
  };
}

// Anomali rasio: ringkasan saja, tanpa lines — review memblokir posting
// sampai pengguna mengisi koreksi manual; JANGAN isi angka template.
export function buildRatioSummary(input: {
  curTotMinor: bigint;
  avgMinor: bigint;
  topCodes: string[];
}): CorrectionFrame {
  const curTotMinor = requirePositiveAmount(input.curTotMinor);
  if (input.avgMinor < 0n) throw new Error("KOREKSI_NOMINAL_TIDAK_VALID");
  const top = input.topCodes.map((c) => c.trim()).filter((c) => c.length > 0);
  return {
    lines: [],
    reversalOfId: null,
    strategy: "SUMMARY_ONLY",
    memo:
      `Ringkasan anomali rasio: total periode berjalan ${Money.formatIdr(curTotMinor)} ` +
      `vs rata-rata ${Money.formatIdr(input.avgMinor)}` +
      (top.length > 0 ? `; akun dominan: ${top.join(", ")}` : "") +
      `. Tanpa jurnal koreksi — isi manual setelah telaah.`,
  };
}
