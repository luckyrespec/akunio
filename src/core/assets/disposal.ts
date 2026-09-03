export interface DisposalJournalLine {
  accountId: string;
  debitMinor: bigint;
  creditMinor: bigint;
  memo: string;
}

export interface DisposalCalculationResult {
  bookValueAtDisposalMinor: bigint;
  gainLossMinor: bigint; // positive = gain, negative = loss
  isGain: boolean;
  journalLines: DisposalJournalLine[];
}

export interface CalculateDisposalParams {
  acquisitionCostMinor: bigint;
  accumulatedDepreciationMinor: bigint;
  proceedsMinor: bigint;
  assetAccountId: string;
  accumulatedDepAccountId: string;
  depositAccountId?: string;
  gainLossAccountId: string;
  assetName?: string;
}

export function calculateAssetDisposal(
  params: CalculateDisposalParams,
): DisposalCalculationResult {
  const {
    acquisitionCostMinor,
    accumulatedDepreciationMinor,
    proceedsMinor,
    assetAccountId,
    accumulatedDepAccountId,
    depositAccountId,
    gainLossAccountId,
    assetName = "Aset Tetap",
  } = params;

  const bookValueAtDisposalMinor = acquisitionCostMinor - accumulatedDepreciationMinor;
  const gainLossMinor = proceedsMinor - bookValueAtDisposalMinor;
  const isGain = gainLossMinor >= 0n;

  const journalLines: DisposalJournalLine[] = [];

  // 1. Debit Kas/Bank jika ada uang diterima dari penjualan
  if (proceedsMinor > 0n && depositAccountId) {
    journalLines.push({
      accountId: depositAccountId,
      debitMinor: proceedsMinor,
      creditMinor: 0n,
      memo: `Penerimaan kas pelepasan ${assetName}`,
    });
  }

  // 2. Debit Akumulasi Penyusutan (menghapus saldo akumulasi depresiasi)
  if (accumulatedDepreciationMinor > 0n) {
    journalLines.push({
      accountId: accumulatedDepAccountId,
      debitMinor: accumulatedDepreciationMinor,
      creditMinor: 0n,
      memo: `Penghapusan akumulasi penyusutan ${assetName}`,
    });
  }

  // 3. Kredit Nilai Perolehan Aset (menghapus harga perolehan historis aset dari neraca)
  journalLines.push({
    accountId: assetAccountId,
    debitMinor: 0n,
    creditMinor: acquisitionCostMinor,
    memo: `Penghapusan nilai perolehan ${assetName}`,
  });

  // 4. Pengakuan Laba atau Rugi Pelepasan Aset
  if (gainLossMinor > 0n) {
    // Kredit Laba Pelepasan Aset
    journalLines.push({
      accountId: gainLossAccountId,
      debitMinor: 0n,
      creditMinor: gainLossMinor,
      memo: `Laba pelepasan ${assetName}`,
    });
  } else if (gainLossMinor < 0n) {
    // Debit Rugi Pelepasan Aset
    const lossMinor = -gainLossMinor;
    journalLines.push({
      accountId: gainLossAccountId,
      debitMinor: lossMinor,
      creditMinor: 0n,
      memo: `Rugi pelepasan ${assetName}`,
    });
  }

  return {
    bookValueAtDisposalMinor,
    gainLossMinor,
    isGain,
    journalLines,
  };
}
