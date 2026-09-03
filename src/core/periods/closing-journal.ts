export interface ClosingLine {
  accountId: string;
  debitMinor: bigint;
  creditMinor: bigint;
  memo: string;
}

export interface YearEndClosingParams {
  revenueBalances: Array<{ accountId: string; balanceCreditMinor: bigint }>;
  expenseBalances: Array<{ accountId: string; balanceDebitMinor: bigint }>;
  incomeSummaryAccountId: string;
  retainedEarningsAccountId: string;
}

export function generateYearEndClosingLines(
  params: YearEndClosingParams,
): ClosingLine[] {
  const {
    revenueBalances,
    expenseBalances,
    incomeSummaryAccountId,
    retainedEarningsAccountId,
  } = params;

  const lines: ClosingLine[] = [];

  let totalRevenueMinor = 0n;
  let totalExpenseMinor = 0n;

  // 1. Tutup akun Pendapatan (Debet Akun Pendapatan untuk menolkan saldo)
  for (const r of revenueBalances) {
    if (r.balanceCreditMinor > 0n) {
      lines.push({
        accountId: r.accountId,
        debitMinor: r.balanceCreditMinor,
        creditMinor: 0n,
        memo: "Penutupan saldo akun pendapatan akhir tahun",
      });
      totalRevenueMinor += r.balanceCreditMinor;
    }
  }

  // 2. Tutup akun Beban (Kredit Akun Beban untuk menolkan saldo)
  for (const e of expenseBalances) {
    if (e.balanceDebitMinor > 0n) {
      lines.push({
        accountId: e.accountId,
        debitMinor: 0n,
        creditMinor: e.balanceDebitMinor,
        memo: "Penutupan saldo akun beban akhir tahun",
      });
      totalExpenseMinor += e.balanceDebitMinor;
    }
  }

  // 3. Pindahkan Laba Bersih / Rugi Bersih ke Laba Ditahan
  // Laba Bersih = Total Pendapatan - Total Beban
  const netIncomeMinor = totalRevenueMinor - totalExpenseMinor;

  if (netIncomeMinor > 0n) {
    // Laba Bersih: Kredit Laba Ditahan
    lines.push({
      accountId: retainedEarningsAccountId,
      debitMinor: 0n,
      creditMinor: netIncomeMinor,
      memo: "Pemindahan laba bersih tahun berjalan ke laba ditahan",
    });
  } else if (netIncomeMinor < 0n) {
    // Rugi Bersih: Debet Laba Ditahan
    const netLossMinor = -netIncomeMinor;
    lines.push({
      accountId: retainedEarningsAccountId,
      debitMinor: netLossMinor,
      creditMinor: 0n,
      memo: "Pemindahan rugi bersih tahun berjalan ke laba ditahan",
    });
  }

  return lines;
}
