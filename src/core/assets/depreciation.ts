export interface DepreciationScheduleItem {
  periodName: string; // 'YYYY-MM'
  depreciationDate: string; // 'YYYY-MM-DD'
  depreciationAmountMinor: bigint;
  accumulatedDepreciationMinor: bigint;
  bookValueMinor: bigint;
}

export interface CalculateDepreciationParams {
  acquisitionCostMinor: bigint;
  salvageValueMinor?: bigint;
  usefulLifeMonths: number;
  inServiceDate: string; // 'YYYY-MM-DD'
  method: "STRAIGHT_LINE" | "DECLINING_BALANCE";
  decliningRatePercent?: number; // e.g. 50 for 50%
}

function getPeriodAndEndOfMonth(startDateISO: string, monthOffset: number): {
  periodName: string;
  depreciationDate: string;
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
  const depreciationDate = `${year}-${monthStr}-${lastDayStr}`;

  return { periodName, depreciationDate };
}

export function calculateDepreciationSchedule(
  params: CalculateDepreciationParams,
): DepreciationScheduleItem[] {
  const {
    acquisitionCostMinor,
    salvageValueMinor = 0n,
    usefulLifeMonths,
    inServiceDate,
    method,
    decliningRatePercent,
  } = params;

  if (usefulLifeMonths <= 0) {
    throw new Error("Masa manfaat aset harus lebih besar dari 0 bulan.");
  }

  const depreciableBasisMinor = acquisitionCostMinor - salvageValueMinor;
  if (depreciableBasisMinor <= 0n) {
    return [];
  }

  const schedule: DepreciationScheduleItem[] = [];
  let currentAccumulatedMinor = 0n;
  let currentBookValueMinor = acquisitionCostMinor;

  if (method === "STRAIGHT_LINE") {
    const monthlyMinor = depreciableBasisMinor / BigInt(usefulLifeMonths);

    for (let m = 0; m < usefulLifeMonths; m++) {
      const { periodName, depreciationDate } = getPeriodAndEndOfMonth(inServiceDate, m);
      const isLastMonth = m === usefulLifeMonths - 1;

      // On the last month, take all remaining depreciable balance to eliminate penny rounding
      const amountMinor = isLastMonth
        ? depreciableBasisMinor - currentAccumulatedMinor
        : monthlyMinor;

      currentAccumulatedMinor += amountMinor;
      currentBookValueMinor = acquisitionCostMinor - currentAccumulatedMinor;

      schedule.push({
        periodName,
        depreciationDate,
        depreciationAmountMinor: amountMinor,
        accumulatedDepreciationMinor: currentAccumulatedMinor,
        bookValueMinor: currentBookValueMinor,
      });
    }
  } else {
    // DECLINING_BALANCE
    // Monthly rate = (annual rate % / 100) / 12
    const rateAnnual = decliningRatePercent ?? (1 / (usefulLifeMonths / 12)) * 2 * 100;
    // Scale rate by 1,000,000 for precision BigInt math:
    // monthlyRateScaled = (rateAnnual / 12 / 100) * 1_000_000 = (rateAnnual * 10_000) / 12
    const monthlyRateScaled = BigInt(Math.round((rateAnnual * 10_000) / 12));

    for (let m = 0; m < usefulLifeMonths; m++) {
      const { periodName, depreciationDate } = getPeriodAndEndOfMonth(inServiceDate, m);
      const isLastMonth = m === usefulLifeMonths - 1;

      // Calculate monthly depreciation from current book value
      let amountMinor = (currentBookValueMinor * monthlyRateScaled) / 1_000_000n;

      // Clamp: book value cannot fall below salvage value
      if (currentBookValueMinor - amountMinor < salvageValueMinor) {
        amountMinor = currentBookValueMinor - salvageValueMinor;
      }

      if (isLastMonth && currentBookValueMinor > salvageValueMinor) {
        amountMinor = currentBookValueMinor - salvageValueMinor;
      }

      if (amountMinor < 0n) amountMinor = 0n;

      currentAccumulatedMinor += amountMinor;
      currentBookValueMinor = acquisitionCostMinor - currentAccumulatedMinor;

      schedule.push({
        periodName,
        depreciationDate,
        depreciationAmountMinor: amountMinor,
        accumulatedDepreciationMinor: currentAccumulatedMinor,
        bookValueMinor: currentBookValueMinor,
      });

      if (currentBookValueMinor <= salvageValueMinor && !isLastMonth) {
        // Book value reached salvage value early; fill remaining months with 0
        for (let nextM = m + 1; nextM < usefulLifeMonths; nextM++) {
          const nextPeriod = getPeriodAndEndOfMonth(inServiceDate, nextM);
          schedule.push({
            periodName: nextPeriod.periodName,
            depreciationDate: nextPeriod.depreciationDate,
            depreciationAmountMinor: 0n,
            accumulatedDepreciationMinor: currentAccumulatedMinor,
            bookValueMinor: currentBookValueMinor,
          });
        }
        break;
      }
    }
  }

  return schedule;
}
