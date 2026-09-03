export interface PreClosingChecklistParams {
  unreconciledBankSessionsCount: number;
  pendingDraftsCount: number;
  unpostedDepreciationAssetsCount: number;
  unpostedInvoicesCount: number;
  trialBalanceDiffMinor: bigint;
}

export interface ChecklistItemStatus {
  passed: boolean;
  title: string;
  message: string;
  count?: number;
}

export interface PreClosingChecklistResult {
  isReady: boolean;
  items: {
    bankReconciliation: ChecklistItemStatus & { unreconciledSessionsCount: number };
    pendingDrafts: ChecklistItemStatus & { pendingCount: number };
    depreciationPosted: ChecklistItemStatus & { unpostedAssetsCount: number };
    unpostedInvoices: ChecklistItemStatus & { unpostedCount: number };
    trialBalance: ChecklistItemStatus & { diffMinor: bigint };
  };
}

export function evaluatePreClosingChecklist(
  params: PreClosingChecklistParams,
): PreClosingChecklistResult {
  const {
    unreconciledBankSessionsCount,
    pendingDraftsCount,
    unpostedDepreciationAssetsCount,
    unpostedInvoicesCount,
    trialBalanceDiffMinor,
  } = params;

  const bankPassed = unreconciledBankSessionsCount === 0;
  const draftsPassed = pendingDraftsCount === 0;
  const depPassed = unpostedDepreciationAssetsCount === 0;
  const invPassed = unpostedInvoicesCount === 0;
  const tbPassed = trialBalanceDiffMinor === 0n;

  const isReady = bankPassed && draftsPassed && depPassed && invPassed && tbPassed;

  return {
    isReady,
    items: {
      bankReconciliation: {
        passed: bankPassed,
        unreconciledSessionsCount: unreconciledBankSessionsCount,
        title: "Rekonsiliasi Bank",
        message: bankPassed
          ? "Seluruh sesi rekening koran telah terverifikasi dan klop."
          : `Terdapat ${unreconciledBankSessionsCount} sesi rekening koran yang belum selesai direkonsiliasi.`,
      },
      pendingDrafts: {
        passed: draftsPassed,
        pendingCount: pendingDraftsCount,
        title: "Draf Jurnal Transaksi",
        message: draftsPassed
          ? "Tidak ada draf jurnal yang menggantung."
          : `Terdapat ${pendingDraftsCount} draf transaksi yang masih menunggu persetujuan.`,
      },
      depreciationPosted: {
        passed: depPassed,
        unpostedAssetsCount: unpostedDepreciationAssetsCount,
        title: "Penyusutan Aset Tetap",
        message: depPassed
          ? "Seluruh beban penyusutan aset periode ini telah diposting."
          : `Terdapat ${unpostedDepreciationAssetsCount} aset yang beban penyusutannya belum diposting bulan ini.`,
      },
      unpostedInvoices: {
        passed: invPassed,
        unpostedCount: unpostedInvoicesCount,
        title: "Faktur & Tagihan",
        message: invPassed
          ? "Seluruh faktur telah tercatat ke buku besar."
          : `Terdapat ${unpostedInvoicesCount} faktur berstatus DRAFT atau belum diposting.`,
      },
      trialBalance: {
        passed: tbPassed,
        diffMinor: trialBalanceDiffMinor,
        title: "Keseimbangan Neraca Saldo",
        message: tbPassed
          ? "Total Debet dan Total Kredit seimbang (Selisih Rp 0)."
          : `Neraca saldo tidak seimbang dengan selisih Rp ${trialBalanceDiffMinor.toString()}.`,
      },
    },
  };
}
