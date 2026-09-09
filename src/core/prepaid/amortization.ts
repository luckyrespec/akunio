export interface AmortizationScheduleItem {
  periodName: string; // 'YYYY-MM'
  amortDate: string; // 'YYYY-MM-DD' (akhir bulan)
  amountMinor: bigint;
  accumulatedMinor: bigint;
  remainingMinor: bigint;
}

function endOfMonth(startDateISO: string, offset: number): { periodName: string; amortDate: string } {
  const [y, m] = startDateISO.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const last = String(new Date(Date.UTC(yy, d.getUTCMonth() + 1, 0)).getUTCDate()).padStart(2, "0");
  return { periodName: `${yy}-${mm}`, amortDate: `${yy}-${mm}-${last}` };
}

export function calculateAmortizationSchedule(args: { totalMinor: bigint; startDate: string; months: number }): AmortizationScheduleItem[] {
  const { totalMinor, startDate, months } = args;
  if (!Number.isInteger(months) || months < 1 || months > 60) throw new Error("JUMLAH_BULAN_TIDAK_VALID: months wajib 1–60.");
  if (totalMinor <= 0n) throw new Error("NOMINAL_TIDAK_VALID: total wajib lebih dari 0.");
  const monthly = totalMinor / BigInt(months);
  const out: AmortizationScheduleItem[] = [];
  let acc = 0n;
  for (let i = 0; i < months; i++) {
    const { periodName, amortDate } = endOfMonth(startDate, i);
    const amount = i === months - 1 ? totalMinor - acc : monthly;
    acc += amount;
    out.push({ periodName, amortDate, amountMinor: amount, accumulatedMinor: acc, remainingMinor: totalMinor - acc });
  }
  return out;
}
