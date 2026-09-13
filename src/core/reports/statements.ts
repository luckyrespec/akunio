import type { AccountAggregate } from "./aggregates";
import { signed } from "./aggregates";

export interface ReportRow {
  code: string;
  name: string;
  movementMinor: bigint;
}

export class UnbalancedSheetError extends Error {
  constructor() { super("NERACA_TIDAK_SEIMBANG"); }
}

const sortByCode = <T extends { code: string }>(rows: T[]): T[] =>
  [...rows].sort((x, y) => x.code.localeCompare(y.code));

export function trialBalance(aggs: Iterable<AccountAggregate>) {
  const rows = sortByCode(
    [...aggs].map((a) => ({
      code: a.meta.code, name: a.meta.name,
      debitMinor: a.debitMinor, creditMinor: a.creditMinor,
    })),
  );
  const totalDebitMinor = rows.reduce((s, r) => s + r.debitMinor, 0n);
  const totalCreditMinor = rows.reduce((s, r) => s + r.creditMinor, 0n);
  return { rows, totalDebitMinor, totalCreditMinor, balanced: totalDebitMinor === totalCreditMinor };
}

export function incomeStatement(aggs: Iterable<AccountAggregate>) {
  const list = [...aggs];
  const toRow = (a: AccountAggregate): ReportRow =>
    ({ code: a.meta.code, name: a.meta.name, movementMinor: signed(a.meta, a) });
  const revenueRows = sortByCode(list.filter((a) => a.meta.type === "PENDAPATAN").map(toRow));
  const expenseRows = sortByCode(list.filter((a) => a.meta.type === "BEBAN").map(toRow));
  const revenueTotalMinor = revenueRows.reduce((s, r) => s + r.movementMinor, 0n);
  const expenseTotalMinor = expenseRows.reduce((s, r) => s + r.movementMinor, 0n);
  return { revenueRows, expenseRows, revenueTotalMinor, expenseTotalMinor, netIncomeMinor: revenueTotalMinor - expenseTotalMinor };
}

export interface BalanceSheetResult {
  assetRows: ReportRow[];
  liabilityRows: ReportRow[];
  equityRows: ReportRow[];
  totalAssetsMinor: bigint;
  totalLiabilitiesMinor: bigint;
  baseEquityMinor: bigint;
  netIncomeMinor: bigint;
  totalEquityAndLiabilitiesMinor: bigint;
  balanced: true;
}

export function balanceSheet(aggs: Iterable<AccountAggregate>, netIncomeMinor: bigint): BalanceSheetResult {
  const list = [...aggs];
  const toRow = (a: AccountAggregate): ReportRow =>
    ({ code: a.meta.code, name: a.meta.name, movementMinor: signed(a.meta, a) });
  const assetRows = sortByCode(list.filter((a) => a.meta.type === "ASET").map(toRow));
  const liabilityRows = sortByCode(list.filter((a) => a.meta.type === "LIABILITAS").map(toRow));
  const equityRows = sortByCode(list.filter((a) => a.meta.type === "EKUITAS").map(toRow));

  const totalAssetsMinor = assetRows.reduce((s, r) => s + r.movementMinor, 0n);
  const totalLiabilitiesMinor = liabilityRows.reduce((s, r) => s + r.movementMinor, 0n);
  const baseEquityMinor = equityRows.reduce((s, r) => s + r.movementMinor, 0n);
  const totalEquityAndLiabilitiesMinor =
    totalLiabilitiesMinor + baseEquityMinor + netIncomeMinor;

  if (totalAssetsMinor !== totalEquityAndLiabilitiesMinor) throw new UnbalancedSheetError();

  equityRows.push({
    code: "9999", name: "Laba Tahun Berjalan", movementMinor: netIncomeMinor,
  });
  equityRows.sort((x, y) => x.code.localeCompare(y.code));

  return {
    assetRows, liabilityRows, equityRows,
    totalAssetsMinor, totalLiabilitiesMinor, baseEquityMinor,
    netIncomeMinor, totalEquityAndLiabilitiesMinor, balanced: true,
  };
}

export function movementByCode(aggs: AccountAggregate[], code: string): bigint {
  const found = aggs.find((x) => x.meta.code === code);
  return found ? signed(found.meta, found) : 0n;
}

export function movementByPrefix(aggs: AccountAggregate[], prefix: string): bigint {
  return aggs
    .filter((x) => x.meta.code.startsWith(prefix))
    .reduce((sum, x) => sum + signed(x.meta, x), 0n);
}

export interface CashFlowInput {
  netIncomeMinor: bigint;
  deltaPiutangMinor: bigint;
  deltaPersediaanMinor: bigint;
  // D4: penyesuaian operasi eksplisit per kategori SAK EMKM (opsional agar
  // pemanggil lama tetap kompilasi — default 0n = perilaku pra-D4).
  deltaDimukaMinor?: bigint; // 16xx beban dibayar di muka (aset lancar)
  deltaUtangUsahaMinor: bigint;
  deltaUtangPajakMinor?: bigint; // 23xx utang pajak (liabilitas pendek)
  depreciationMinor: bigint;
  investingMinor: bigint;
  financingMinor: bigint;
}

export interface CashFlowResult {
  operatingMinor: bigint;
  investingMinor: bigint;
  financingMinor: bigint;
  netChangeMinor: bigint;
  rows: ReportRow[];
}

export function cashFlowIndirect(i: CashFlowInput): CashFlowResult {
  const deltaDimukaMinor = i.deltaDimukaMinor ?? 0n;
  const deltaUtangPajakMinor = i.deltaUtangPajakMinor ?? 0n;
  const rows: ReportRow[] = [
    { code: "NI", name: "Laba Bersih", movementMinor: i.netIncomeMinor },
    { code: "ADJ.PIUTANG", name: "Perubahan Piutang Usaha", movementMinor: -i.deltaPiutangMinor },
    { code: "ADJ.PERSEDIAAN", name: "Perubahan Persediaan", movementMinor: -i.deltaPersediaanMinor },
    { code: "ADJ.DIMUKA", name: "Perubahan Beban Dibayar di Muka", movementMinor: -deltaDimukaMinor },
    { code: "ADJ.UTANG", name: "Perubahan Utang Usaha", movementMinor: i.deltaUtangUsahaMinor },
    { code: "ADJ.UTANGPAJAK", name: "Perubahan Utang Pajak", movementMinor: deltaUtangPajakMinor },
    { code: "ADJ.PENYUSUTAN", name: "Beban Penyusutan", movementMinor: i.depreciationMinor },
  ];
  const operatingMinor =
    i.netIncomeMinor - i.deltaPiutangMinor - i.deltaPersediaanMinor -
    deltaDimukaMinor + i.deltaUtangUsahaMinor + deltaUtangPajakMinor +
    i.depreciationMinor;
  return {
    operatingMinor,
    investingMinor: i.investingMinor,
    financingMinor: i.financingMinor,
    netChangeMinor: operatingMinor + i.investingMinor + i.financingMinor,
    rows,
  };
}

export interface ChangesInEquityInput {
  openingRetainedEarningsMinor: bigint;
  contributionsMinor: bigint;
  drawingsMinor: bigint;
  netIncomeMinor: bigint;
}

export function changesInEquity(i: ChangesInEquityInput) {
  const closingRetainedEarningsMinor =
    i.openingRetainedEarningsMinor + i.netIncomeMinor - i.drawingsMinor;
  const rows = [
    { label: "Modal Disetor", movementMinor: i.contributionsMinor },
    { label: "Prive", movementMinor: -i.drawingsMinor },
    { label: "Laba Tahun Berjalan", movementMinor: i.netIncomeMinor },
  ];
  return { rows, closingRetainedEarningsMinor };
}
