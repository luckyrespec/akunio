export type FindingDraft = { type: string; severity: "HIGH"|"MEDIUM"|"LOW"; evidence: Record<string, unknown> };
export function abnormalBalances(aggs: Array<{ meta: { code: string; type: string; normal: string }; debitMinor: bigint; creditMinor: bigint }>): FindingDraft[] {
  return aggs.filter(a => {
    const bal = a.meta.normal === "D" ? a.debitMinor - a.creditMinor : a.creditMinor - a.debitMinor;
    return (a.meta.normal === "D" && bal < 0n) || (a.meta.normal === "K" && bal < 0n);
  }).map(a => ({ type: "abnormalBalances", severity: "HIGH", evidence: { code: a.meta.code } }));
}
export function duplicates(entries: Array<{ memo: string; lines: unknown[] }>): FindingDraft[] {
  const seen = new Map<string, number>();
  const out: FindingDraft[] = [];
  entries.forEach((e, i) => {
    const k = JSON.stringify({ memo: e.memo, lines: e.lines });
    if (seen.has(k)) out.push({ type: "duplicates", severity: "MEDIUM", evidence: { index: i } });
    else seen.set(k, i);
  });
  return out;
}
export function missingReceipts(entries: Array<{ amountMinor: bigint; documentId: string | null }>, threshold: bigint): FindingDraft[] {
  return entries.filter(e => e.amountMinor > threshold && !e.documentId).map(e => ({ type: "missingReceipts", severity: "MEDIUM", evidence: { amountMinor: e.amountMinor.toString() } }));
}
export function oddDates(entries: Array<{ dateISO: string }>, periods: Array<{ startsOn: string; endsOn: string; status: string }>): FindingDraft[] {
  return entries.filter(e => !periods.some(p => e.dateISO >= p.startsOn && e.dateISO <= p.endsOn && p.status === "OPEN")).map(e => ({ type: "oddDates", severity: "MEDIUM", evidence: { dateISO: e.dateISO } }));
}
export function ratioAnomalies(current: Array<{ meta: { code: string }; debitMinor: bigint; creditMinor: bigint }>, history: Array<typeof current>): FindingDraft[] {
  if (history.length < 3) return [];
  const curTot = current.reduce((s, a) => s + (a.debitMinor > a.creditMinor ? a.debitMinor - a.creditMinor : a.creditMinor - a.debitMinor), 0n);
  const histAvgs = history.map(h => h.reduce((s, a) => s + (a.debitMinor > a.creditMinor ? a.debitMinor - a.creditMinor : a.creditMinor - a.debitMinor), 0n));
  const avg = histAvgs.reduce((s, v) => s + v, 0n) / BigInt(histAvgs.length);
  if (curTot > avg * 2n) return [{ type: "ratioAnomalies", severity: "LOW", evidence: { curTot: curTot.toString(), avg: avg.toString() } }];
  return [];
}
