export interface AmortizationScheduleItem {
  periodName: string; // 'YYYY-MM'
  amortizationDate: string; // 'YYYY-MM-DD'
  amortizationAmountMinor: bigint;
  accumulatedMinor: bigint;
  bookValueMinor: bigint;
}

export interface CalculateAmortizationParams {
  acquisitionCostMinor: bigint;
  usefulLifeMonths: number;
  inServiceDate: string; // 'YYYY-MM-DD'
}

function getPeriodAndEndOfMonth(startDateISO: string, monthOffset: number): {
  periodName: string;
  amortizationDate: string;
} {
  const parts = startDateISO.split("-");
  const baseYear = parseInt(parts[0], 10);
  const baseMonth = parseInt(parts[1], 10) - 1; // 0-indexed

  const targetDate = new Date(Date.UTC(baseYear, baseMonth + monthOffset, 1));
  const year = targetDate.getUTCFullYear();
  const month = targetDate.getUTCMonth() + 1; // 1-12
  const monthStr = month < 10 ? `0${month}` : `${month}`;
  const periodName = `${year}-${monthStr}`;

  // End of this month
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDayStr = lastDay < 10 ? `0${lastDay}` : `${lastDay}`;
  const amortizationDate = `${year}-${monthStr}-${lastDayStr}`;

  return { periodName, amortizationDate };
}

/**
 * Jadwal amortisasi garis lurus aset takberwujud (SAK EMKM Bab 12).
 * Basis penuh biaya perolehan (residu dianggap nol); bulan terakhir
 * menyerap sisa pembulatan. Murni (tanpa I/O) agar mudah diuji.
 */
export function calculateAmortizationSchedule(
  params: CalculateAmortizationParams,
): AmortizationScheduleItem[] {
  const { acquisitionCostMinor, usefulLifeMonths, inServiceDate } = params;

  if (usefulLifeMonths <= 0) {
    throw new Error("Masa manfaat aset takberwujud harus lebih besar dari 0 bulan.");
  }
  if (acquisitionCostMinor <= 0n) {
    return [];
  }

  const monthlyMinor = acquisitionCostMinor / BigInt(usefulLifeMonths);
  const schedule: AmortizationScheduleItem[] = [];
  let currentAccumulatedMinor = 0n;

  for (let m = 0; m < usefulLifeMonths; m++) {
    const { periodName, amortizationDate } = getPeriodAndEndOfMonth(inServiceDate, m);
    const isLastMonth = m === usefulLifeMonths - 1;

    // Bulan terakhir: ambil seluruh sisa agar total pas tanpa sen nyasar.
    const amountMinor = isLastMonth
      ? acquisitionCostMinor - currentAccumulatedMinor
      : monthlyMinor;

    currentAccumulatedMinor += amountMinor;

    schedule.push({
      periodName,
      amortizationDate,
      amortizationAmountMinor: amountMinor,
      accumulatedMinor: currentAccumulatedMinor,
      bookValueMinor: acquisitionCostMinor - currentAccumulatedMinor,
    });
  }

  return schedule;
}
