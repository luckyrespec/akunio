import type { Queryable } from "@/server/db/repos/queryable";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { postedLinesThrough } from "@/server/reports/build";
import { aggregateFromLines } from "@/core/reports/aggregates";
import { listEntriesWithLines } from "@/server/db/repos/journals.repo";
import { listPeriods } from "@/server/db/repos/periods.repo";
import { abnormalBalances, duplicates, missingReceipts, oddDates, type FindingDraft } from "./rules";
import { createFinding } from "@/server/db/repos/findings.repo";
import { journalDocuments } from "@/server/db/schema/ai";
import { eq, inArray } from "drizzle-orm";

export interface DoctorScanResult {
  totalScannedEntries: number;
  newFindingsCount: number;
  healthScore: number;
  breakdown: {
    abnormalBalances: number;
    duplicates: number;
    missingReceipts: number;
    oddDates: number;
  };
}

export async function runDoctorAuditScan(
  q: Queryable,
  orgId: string,
): Promise<DoctorScanResult> {
  const todayISO = new Date().toISOString().slice(0, 10);

  // 1. Ambil meta akun & posted lines untuk saldo abnormal
  const { listAccounts } = await import("@/server/db/repos/accounts.repo");
  const accRows = await listAccounts(q, orgId);
  const metas = reportMetaMap(accRows);
  const lines = await postedLinesThrough(q, orgId, todayISO);
  const aggs = aggregateFromLines(lines, metas);
  const abnormalDrafts = abnormalBalances(aggs);

  // 2. Ambil entri jurnal terbaru (maksimal 200) untuk deteksi duplikat & tanggal
  const entries = await listEntriesWithLines(q, orgId, 200, 0);
  const periods = await listPeriods(q, orgId);

  // Cek duplikat
  const duplicateDrafts = duplicates(
    entries.map((e) => ({
      memo: e.memo,
      lines: e.lines.map((l) => ({
        accountCode: l.accountCode,
        debitMinor: l.debitMinor.toString(),
        creditMinor: l.creditMinor.toString(),
      })),
    })),
  );

  // Enrich duplicate evidence dengan data entry jika ada
  duplicateDrafts.forEach((d) => {
    const idx = (d.evidence as { index?: number })?.index;
    if (idx !== undefined && entries[idx]) {
      d.evidence = {
        ...d.evidence,
        entryId: entries[idx].id,
        entryNumber: entries[idx].number,
        memo: entries[idx].memo,
      };
    }
  });

  // Cek oddDates (tanggal di luar periode OPEN)
  const oddDateDrafts = oddDates(
    entries.map((e) => ({ dateISO: e.entryDate })),
    periods.map((p) => ({
      startsOn: p.startsOn,
      endsOn: p.endsOn,
      status: p.status,
    })),
  );
  oddDateDrafts.forEach((d) => {
    const matched = entries.find((e) => e.entryDate === (d.evidence as { dateISO?: string })?.dateISO);
    if (matched) {
      d.evidence = {
        ...d.evidence,
        entryId: matched.id,
        entryNumber: matched.number,
        memo: matched.memo,
      };
    }
  });

  // 3. Cek Missing Receipts untuk transaksi di atas batas Rp 1.000.000 (100.000.000 minor)
  const entryIds = entries.map((e) => e.id);
  const docs = entryIds.length > 0
    ? await q
        .select({ entryId: journalDocuments.entryId, docId: journalDocuments.documentId })
        .from(journalDocuments)
        .where(inArray(journalDocuments.entryId, entryIds))
    : [];
  const docMap = new Set(docs.map((d) => d.entryId));

  const missingReceiptDrafts: FindingDraft[] = [];
  const THRESHOLD = 100_000_000n; // Rp 1.000.000

  for (const entry of entries) {
    const totalDebit = entry.lines.reduce((s, l) => s + l.debitMinor, 0n);
    if (totalDebit >= THRESHOLD && !docMap.has(entry.id)) {
      missingReceiptDrafts.push({
        type: "missingReceipts",
        severity: "MEDIUM",
        evidence: {
          entryId: entry.id,
          entryNumber: entry.number,
          memo: entry.memo,
          amountMinor: totalDebit.toString(),
        },
      });
    }
  }

  // Gabungkan semua temuan
  const allDrafts: FindingDraft[] = [
    ...abnormalDrafts,
    ...duplicateDrafts,
    ...oddDateDrafts,
    ...missingReceiptDrafts,
  ];

  // Hindari duplikasi temuan OPEN yang sama persis
  const { listFindings } = await import("@/server/db/repos/findings.repo");
  const existingOpen = await listFindings(q, orgId, "open");
  const existingKeys = new Set(
    existingOpen.map((e) => {
      const ev = (e.evidence as Record<string, unknown>) ?? {};
      const keyDetail = ev.code || ev.entryId || ev.dateISO || JSON.stringify(ev);
      return `${e.type}:${keyDetail}`;
    }),
  );

  let newlyCreatedCount = 0;
  for (const draft of allDrafts) {
    const ev = draft.evidence ?? {};
    const keyDetail = ev.code || ev.entryId || ev.dateISO || JSON.stringify(ev);
    const key = `${draft.type}:${keyDetail}`;
    if (!existingKeys.has(key)) {
      await createFinding(q, orgId, draft);
      existingKeys.add(key);
      newlyCreatedCount++;
    }
  }

  // Hitung Health Score (0 - 100)
  // Bobot penalti: HIGH: -15, MEDIUM: -7, LOW: -3
  let penalty = 0;
  penalty += abnormalDrafts.length * 15;
  penalty += duplicateDrafts.length * 7;
  penalty += missingReceiptDrafts.length * 5;
  penalty += oddDateDrafts.length * 7;
  const healthScore = Math.max(0, Math.min(100, 100 - penalty));

  return {
    totalScannedEntries: entries.length,
    newFindingsCount: allDrafts.length,
    healthScore,
    breakdown: {
      abnormalBalances: abnormalDrafts.length,
      duplicates: duplicateDrafts.length,
      missingReceipts: missingReceiptDrafts.length,
      oddDates: oddDateDrafts.length,
    },
  };
}
