export interface ClosingLine {
  accountId: string;
  debitMinor: bigint;
  creditMinor: bigint;
  memo: string;
}

/**
 * Saldo sementara bertanda per akun: positif = searah normal
 * (pendapatan = kredit neto, beban/prive = debit neto), negatif = abnormal
 * (lawan dari normal). Nol = tidak dibuatkan baris penutup.
 */
export interface TempBalance {
  accountId: string;
  balanceMinor: bigint;
}

export interface YearEndClosingParams {
  revenueBalances: TempBalance[];
  expenseBalances: TempBalance[];
  /** Prive pemilik (`33xx`, EKUITAS/D) — ikut ditutup ke Laba Ditahan. */
  drawingsBalances: TempBalance[];
  retainedEarningsAccountId: string;
}

/**
 * Jurnal penutup akhir tahun SATU TAHAP, langsung ke Laba Ditahan.
 *
 * Kebijakan Akunio (didokumentasikan, disengaja): TIDAK memakai akun
 * perantara Ikhtisar Laba Rugi — seluruh akun nominal (pendapatan, beban,
 * prive) dinolkan dan selisih bersihnya dipindahkan ke Laba Ditahan dalam
 * satu jurnal. Saldo abnormal (berlawanan normal) ikut ditutup: sisi
 * penutupnya dibalik mengikuti tanda saldo.
 */
export function generateYearEndClosingLines(
  params: YearEndClosingParams,
): ClosingLine[] {
  const {
    revenueBalances,
    expenseBalances,
    drawingsBalances,
    retainedEarningsAccountId,
  } = params;

  const lines: ClosingLine[] = [];

  let totalRevenueMinor = 0n;
  let totalExpenseMinor = 0n;
  let totalDrawingsMinor = 0n;

  // 1. Nolkan akun Pendapatan (saldo kredit normal → debet; abnormal → kredit).
  for (const r of revenueBalances) {
    if (r.balanceMinor === 0n) continue;
    if (r.balanceMinor > 0n) {
      lines.push({
        accountId: r.accountId,
        debitMinor: r.balanceMinor,
        creditMinor: 0n,
        memo: "Penutupan saldo akun pendapatan akhir tahun",
      });
    } else {
      lines.push({
        accountId: r.accountId,
        debitMinor: 0n,
        creditMinor: -r.balanceMinor,
        memo: "Penutupan saldo abnormal akun pendapatan akhir tahun",
      });
    }
    totalRevenueMinor += r.balanceMinor;
  }

  // 2. Nolkan akun Beban (saldo debit normal → kredit; abnormal → debet).
  for (const e of expenseBalances) {
    if (e.balanceMinor === 0n) continue;
    if (e.balanceMinor > 0n) {
      lines.push({
        accountId: e.accountId,
        debitMinor: 0n,
        creditMinor: e.balanceMinor,
        memo: "Penutupan saldo akun beban akhir tahun",
      });
    } else {
      lines.push({
        accountId: e.accountId,
        debitMinor: -e.balanceMinor,
        creditMinor: 0n,
        memo: "Penutupan saldo abnormal akun beban akhir tahun",
      });
    }
    totalExpenseMinor += e.balanceMinor;
  }

  // 3. Nolkan Prive 33xx (saldo debit normal → kredit; abnormal → debet).
  for (const d of drawingsBalances) {
    if (d.balanceMinor === 0n) continue;
    if (d.balanceMinor > 0n) {
      lines.push({
        accountId: d.accountId,
        debitMinor: 0n,
        creditMinor: d.balanceMinor,
        memo: "Penutupan saldo prive akhir tahun",
      });
    } else {
      lines.push({
        accountId: d.accountId,
        debitMinor: -d.balanceMinor,
        creditMinor: 0n,
        memo: "Penutupan saldo abnormal prive akhir tahun",
      });
    }
    totalDrawingsMinor += d.balanceMinor;
  }

  // 4. Pindahkan hasil bersih (laba − prive) ke Laba Ditahan.
  const netMinor = totalRevenueMinor - totalExpenseMinor - totalDrawingsMinor;

  if (netMinor > 0n) {
    lines.push({
      accountId: retainedEarningsAccountId,
      debitMinor: 0n,
      creditMinor: netMinor,
      memo: "Pemindahan laba bersih tahun berjalan ke laba ditahan",
    });
  } else if (netMinor < 0n) {
    lines.push({
      accountId: retainedEarningsAccountId,
      debitMinor: -netMinor,
      creditMinor: 0n,
      memo: "Pemindahan rugi bersih tahun berjalan ke laba ditahan",
    });
  }

  return lines;
}
