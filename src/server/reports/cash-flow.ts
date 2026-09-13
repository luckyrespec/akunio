import { eq } from "drizzle-orm";
import { aggregateFromLines, signed, type AccountAggregate } from "@/core/reports/aggregates";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import type { Queryable } from "@/server/db/repos/queryable";
import { accounts } from "@/server/db/schema/org";
import { postedLinesBetween } from "@/server/reports/build";
import {
  cashFlowIndirect,
  incomeStatement,
  movementByPrefix,
  type CashFlowResult,
} from "@/core/reports/statements";

export interface CashFlowBuckets {
  deltaPiutangMinor: bigint; // 12xx
  deltaPersediaanMinor: bigint; // 13xx
  deltaDimukaMinor: bigint; // 16xx — beban dibayar di muka (aset lancar)
  deltaUtangUsahaMinor: bigint; // 21xx — utang usaha/pendek
  deltaUtangPajakMinor: bigint; // 23xx — utang pajak (liabilitas pendek)
  bebanPajakMinor: bigint; // 57xx — beban pajak
  depreciationMinor: bigint; // 56xx
  investingMinor: bigint; // −15xx
  financingMinor: bigint; // 31xx + 24xx − 33xx
}

// Bucket arus kas dipakai bersama arus-kas/page.tsx + test (R11):
// satu-satunya sumber pemetaan prefix → kategori. Rentang selaras
// sak-emkm.ts: dimuka 16xx (aset lancar, 60-63), utang pajak 23xx
// (liabilitas pendek <2400, 85-89), beban pajak 57xx (177-183).
// movementByPrefix dipakai langsung (tanpa duplikasi logika rentang).
export function cashFlowBuckets(aggs: AccountAggregate[]): CashFlowBuckets {
  return {
    deltaPiutangMinor: movementByPrefix(aggs, "12"),
    deltaPersediaanMinor: movementByPrefix(aggs, "13"),
    deltaDimukaMinor: movementByPrefix(aggs, "16"),
    deltaUtangUsahaMinor: movementByPrefix(aggs, "21"),
    deltaUtangPajakMinor: movementByPrefix(aggs, "23"),
    bebanPajakMinor: movementByPrefix(aggs, "57"),
    depreciationMinor: movementByPrefix(aggs, "56"),
    investingMinor: -movementByPrefix(aggs, "15"),
    financingMinor:
      movementByPrefix(aggs, "31") +
      movementByPrefix(aggs, "24") -
      movementByPrefix(aggs, "33"),
  };
}

export interface BuiltCashFlow extends CashFlowResult {
  buckets: CashFlowBuckets;
  // Kas neto untuk pajak (metode tidak langsung: Δutang pajak − beban pajak;
  // negatif = kas keluar). Subset operasi — BUKAN penambah total.
  pajakMinor: bigint;
  deltaKasMinor: bigint;
  // Sisa unmapped saja; temuan Doctor bila material (>1% delta kas, abs).
  residualMinor: bigint;
  netChangeTiedMinor: bigint;
}

// Ambang material residu: >1% delta kas (nilai absolut). Tanpa traffic kas,
// residu nonzero apa pun dianggap material.
export function isCashFlowResidualMaterial(
  residualMinor: bigint,
  deltaKasMinor: bigint,
): boolean {
  if (residualMinor === 0n) return false;
  const abs = (v: bigint): bigint => (v < 0n ? -v : v);
  if (deltaKasMinor === 0n) return true;
  return abs(residualMinor) * 100n > abs(deltaKasMinor);
}

// Komposisi arus kas dipakai bersama arus-kas/page.tsx + test: postedLines
// Between → aggregate → incomeStatement/cashFlowIndirect → tie ke kas.
export async function buildCashFlow(
  q: Queryable,
  orgId: string,
  fromISO: string,
  throughISO: string,
): Promise<BuiltCashFlow> {
  const accRows = await q.select().from(accounts).where(eq(accounts.orgId, orgId));
  const metas = reportMetaMap(accRows);
  const lines = await postedLinesBetween(q, orgId, fromISO, throughISO);
  const aggs = aggregateFromLines(lines, metas);
  const buckets = cashFlowBuckets(aggs);
  const { netIncomeMinor } = incomeStatement(aggs);
  const cf = cashFlowIndirect({
    netIncomeMinor,
    deltaPiutangMinor: buckets.deltaPiutangMinor,
    deltaPersediaanMinor: buckets.deltaPersediaanMinor,
    deltaDimukaMinor: buckets.deltaDimukaMinor,
    deltaUtangUsahaMinor: buckets.deltaUtangUsahaMinor,
    deltaUtangPajakMinor: buckets.deltaUtangPajakMinor,
    depreciationMinor: buckets.depreciationMinor,
    investingMinor: buckets.investingMinor,
    financingMinor: buckets.financingMinor,
  });
  const deltaKasMinor = aggs
    .filter((a) => a.meta.isCash || a.meta.isBank)
    .reduce((sum, a) => sum + signed(a.meta, a), 0n);
  const residualMinor = deltaKasMinor - cf.netChangeMinor;
  const pajakMinor = buckets.deltaUtangPajakMinor - buckets.bebanPajakMinor;
  return {
    ...cf,
    buckets,
    pajakMinor,
    deltaKasMinor,
    residualMinor,
    netChangeTiedMinor: cf.netChangeMinor + residualMinor,
  };
}
