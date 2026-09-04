import type { JournalEntryInput } from "@/core/journals/types";

export interface BuildAcquisitionJournalParams {
  assetId: string;
  assetCode: string;
  assetName: string;
  assetAccountId: string;
  counterAccountId: string;
  acquisitionCostMinor: bigint;
  acquisitionDate: string; // 'YYYY-MM-DD'
}

/**
 * Membangun jurnal perolehan aset tetap: Dr Akun Aset 15xx / Cr Akun Lawan
 * (Kas & Bank untuk tunai, Utang untuk kredit, Ekuitas/Modal untuk migrasi saldo awal).
 * Murni (tanpa I/O) agar mudah diuji; diposting atomik bersama pendaftaran aset.
 */
export function buildAcquisitionJournal(
  params: BuildAcquisitionJournalParams,
): JournalEntryInput {
  const {
    assetId,
    assetCode,
    assetName,
    assetAccountId,
    counterAccountId,
    acquisitionCostMinor,
    acquisitionDate,
  } = params;

  if (acquisitionCostMinor <= 0n) {
    throw new Error("Harga perolehan aset harus lebih besar dari Rp 0.");
  }
  if (assetAccountId === counterAccountId) {
    throw new Error("Akun aset dan akun lawan jurnal perolehan tidak boleh sama.");
  }

  return {
    dateISO: acquisitionDate,
    memo: `Perolehan aset ${assetCode} — ${assetName}`,
    source: "MANUAL",
    idempotencyKey: `asset-acq-${assetId}`,
    lines: [
      {
        accountId: assetAccountId,
        debitMinor: acquisitionCostMinor,
        creditMinor: 0n,
        memo: assetName,
      },
      {
        accountId: counterAccountId,
        debitMinor: 0n,
        creditMinor: acquisitionCostMinor,
        memo: assetName,
      },
    ],
  };
}
