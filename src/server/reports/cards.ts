import { eq } from "drizzle-orm";
import { aggregateFromLines, signed } from "@/core/reports/aggregates";
import {
  buildSakEmkmBalanceSheet,
  buildSakEmkmIncomeStatement,
} from "@/core/reports/sak-emkm";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import {
  listEntriesWithLinesFiltered,
  type EntryView,
} from "@/server/db/repos/journals.repo";
import type { Queryable } from "@/server/db/repos/queryable";
import { accounts } from "@/server/db/schema/org";
import { postedLinesBetween, postedLinesThrough } from "@/server/reports/build";

export interface LaporanIndexCards {
  netIncome: bigint;
  totalAssets: bigint;
  cashPosition: bigint;
  totalEquity: bigint;
  isBalanced: boolean;
}

// Komposisi kartu index dipakai bersama laporan/page.tsx + test: neraca/
// ekuitas/kas kumulatif Through akhir tahun (== halaman detail neraca),
// L/R tetap YTD Between Jan–Des tahun berjalan.
export async function getLaporanIndexCards(
  q: Queryable,
  orgId: string,
  year: number,
): Promise<LaporanIndexCards> {
  const yearEndISO = `${year}-12-31`;
  const accRows = await q.select().from(accounts).where(eq(accounts.orgId, orgId));
  // Sekuensial: q bisa satu transaksi (satu pg client tak boleh query konkuren).
  const linesThrough = await postedLinesThrough(q, orgId, yearEndISO);
  const linesYtd = await postedLinesBetween(q, orgId, `${year}-01-01`, yearEndISO);

  const metas = reportMetaMap(accRows);
  const aggsCum = aggregateFromLines(linesThrough, metas);
  const aggsYtd = aggregateFromLines(linesYtd, metas);

  const isYtd = buildSakEmkmIncomeStatement(aggsYtd);
  const cashPosition = aggsCum
    .filter((a) => a.meta.isCash || a.meta.isBank)
    .reduce((s, a) => s + signed(a.meta, a), 0n);

  const isCum = buildSakEmkmIncomeStatement(aggsCum);
  const bs = buildSakEmkmBalanceSheet(aggsCum, isCum.netIncomeMinor);
  return {
    netIncome: isYtd.netIncomeMinor,
    totalAssets: bs.totalAssetsMinor,
    cashPosition,
    totalEquity: bs.totalEquityMinor,
    isBalanced: bs.isBalanced,
  };
}

// Posisi kas dasbor dipakai bersama dasbor/page.tsx + test: kumulatif
// Through tanggal hari ini (jurnal bertanggal masa depan tak ikut).
export async function getDasborCash(
  q: Queryable,
  orgId: string,
  todayISODate: string,
): Promise<bigint> {
  const accRows = await q.select().from(accounts).where(eq(accounts.orgId, orgId));
  const cashLines = await postedLinesThrough(q, orgId, todayISODate);
  const metas = reportMetaMap(accRows);
  return aggregateFromLines(cashLines, metas)
    .filter((a) => a.meta.isCash || a.meta.isBank)
    .reduce((s, a) => s + signed(a.meta, a), 0n);
}

// Aktivitas terakhir dasbor dipakai bersama dasbor/page.tsx + test:
// hanya jurnal POSTED (draf dikecualikan).
export function getDasborRecentActivity(
  q: Queryable,
  orgId: string,
  limit = 5,
): Promise<EntryView[]> {
  return listEntriesWithLinesFiltered(q, orgId, { status: "POSTED" }, limit);
}
