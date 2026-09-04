import type { AccountAggregate } from "./aggregates";
import { signed } from "./aggregates";
import type { ReportRow } from "./statements";

export interface SakEmkmBalanceSheet {
  currentAssetRows: ReportRow[];
  totalCurrentAssetsMinor: bigint;
  fixedAssetRows: ReportRow[];
  totalFixedAssetsMinor: bigint;
  totalAssetsMinor: bigint;
  shortTermLiabilityRows: ReportRow[];
  totalShortTermLiabilitiesMinor: bigint;
  longTermLiabilityRows: ReportRow[];
  totalLongTermLiabilitiesMinor: bigint;
  totalLiabilitiesMinor: bigint;
  equityRows: ReportRow[];
  totalEquityMinor: bigint;
  totalLiabilitiesAndEquityMinor: bigint;
  isBalanced: boolean;
}

export interface SakEmkmIncomeStatement {
  revenueRows: ReportRow[];
  totalRevenueMinor: bigint;
  cogsRows: ReportRow[];
  totalCogsMinor: bigint;
  grossProfitMinor: bigint;
  operatingExpenseRows: ReportRow[];
  totalOperatingExpenseMinor: bigint;
  operatingIncomeMinor: bigint;
  otherRevenueRows: ReportRow[];
  totalOtherRevenueMinor: bigint;
  otherExpenseRows: ReportRow[];
  totalOtherExpenseMinor: bigint;
  taxExpenseRows: ReportRow[];
  totalTaxExpenseMinor: bigint;
  netIncomeMinor: bigint;
}

const sortByCode = <T extends { code: string }>(rows: T[]): T[] =>
  [...rows].sort((x, y) => x.code.localeCompare(y.code));

export function buildSakEmkmBalanceSheet(
  aggs: Iterable<AccountAggregate>,
  netIncomeMinor: bigint,
): SakEmkmBalanceSheet {
  const list = [...aggs];
  const toRow = (a: AccountAggregate): ReportRow => ({
    code: a.meta.code,
    name: a.meta.name,
    movementMinor: signed(a.meta, a),
  });

  const assetList = list.filter((a) => a.meta.type === "ASET").map(toRow);
  const liabilityList = list.filter((a) => a.meta.type === "LIABILITAS").map(toRow);
  const equityList = list.filter((a) => a.meta.type === "EKUITAS").map(toRow);

  const currentAssetRows = sortByCode(
    assetList.filter((r) => {
      const codeNum = parseInt(r.code, 10);
      return isNaN(codeNum) || codeNum < 1500;
    }),
  );

  const fixedAssetRows = sortByCode(
    assetList.filter((r) => {
      const codeNum = parseInt(r.code, 10);
      return !isNaN(codeNum) && codeNum >= 1500;
    }),
  );

  const totalCurrentAssetsMinor = currentAssetRows.reduce((s, r) => s + r.movementMinor, 0n);
  const totalFixedAssetsMinor = fixedAssetRows.reduce((s, r) => s + r.movementMinor, 0n);
  const totalAssetsMinor = totalCurrentAssetsMinor + totalFixedAssetsMinor;

  const shortTermLiabilityRows = sortByCode(
    liabilityList.filter((r) => {
      const codeNum = parseInt(r.code, 10);
      return isNaN(codeNum) || codeNum < 2400;
    }),
  );

  const longTermLiabilityRows = sortByCode(
    liabilityList.filter((r) => {
      const codeNum = parseInt(r.code, 10);
      return !isNaN(codeNum) && codeNum >= 2400;
    }),
  );

  const totalShortTermLiabilitiesMinor = shortTermLiabilityRows.reduce((s, r) => s + r.movementMinor, 0n);
  const totalLongTermLiabilitiesMinor = longTermLiabilityRows.reduce((s, r) => s + r.movementMinor, 0n);
  const totalLiabilitiesMinor = totalShortTermLiabilitiesMinor + totalLongTermLiabilitiesMinor;

  const equityRows = [...equityList];
  equityRows.push({
    code: "3999",
    name: "Laba (Rugi) Periode Berjalan",
    movementMinor: netIncomeMinor,
  });
  sortByCode(equityRows);

  const totalEquityMinor = equityRows.reduce((s, r) => s + r.movementMinor, 0n);
  const totalLiabilitiesAndEquityMinor = totalLiabilitiesMinor + totalEquityMinor;

  return {
    currentAssetRows,
    totalCurrentAssetsMinor,
    fixedAssetRows,
    totalFixedAssetsMinor,
    totalAssetsMinor,
    shortTermLiabilityRows,
    totalShortTermLiabilitiesMinor,
    longTermLiabilityRows,
    totalLongTermLiabilitiesMinor,
    totalLiabilitiesMinor,
    equityRows,
    totalEquityMinor,
    totalLiabilitiesAndEquityMinor,
    isBalanced: totalAssetsMinor === totalLiabilitiesAndEquityMinor,
  };
}

export function buildSakEmkmIncomeStatement(
  aggs: Iterable<AccountAggregate>,
): SakEmkmIncomeStatement {
  const list = [...aggs];
  const toRow = (a: AccountAggregate): ReportRow => ({
    code: a.meta.code,
    name: a.meta.name,
    movementMinor: signed(a.meta, a),
  });

  const revenues = list.filter((a) => a.meta.type === "PENDAPATAN").map(toRow);
  const expenses = list.filter((a) => a.meta.type === "BEBAN").map(toRow);

  const revenueRows = sortByCode(
    revenues.filter((r) => {
      const codeNum = parseInt(r.code, 10);
      return isNaN(codeNum) || codeNum < 4200;
    }),
  );
  const otherRevenueRows = sortByCode(
    revenues.filter((r) => {
      const codeNum = parseInt(r.code, 10);
      return !isNaN(codeNum) && codeNum >= 4200;
    }),
  );

  const totalRevenueMinor = revenueRows.reduce((s, r) => s + r.movementMinor, 0n);
  const totalOtherRevenueMinor = otherRevenueRows.reduce((s, r) => s + r.movementMinor, 0n);

  const cogsRows = sortByCode(
    expenses.filter((r) => {
      const codeNum = parseInt(r.code, 10);
      return !isNaN(codeNum) && codeNum >= 5100 && codeNum < 5200;
    }),
  );
  const totalCogsMinor = cogsRows.reduce((s, r) => s + r.movementMinor, 0n);

  const operatingExpenseRows = sortByCode(
    expenses.filter((r) => {
      const codeNum = parseInt(r.code, 10);
      return !isNaN(codeNum) && codeNum >= 5200 && codeNum < 5700;
    }),
  );
  const totalOperatingExpenseMinor = operatingExpenseRows.reduce((s, r) => s + r.movementMinor, 0n);

  const taxExpenseRows = sortByCode(
    expenses.filter((r) => {
      const codeNum = parseInt(r.code, 10);
      return !isNaN(codeNum) && codeNum >= 5700 && codeNum < 5800;
    }),
  );
  const totalTaxExpenseMinor = taxExpenseRows.reduce((s, r) => s + r.movementMinor, 0n);

  const otherExpenseRows = sortByCode(
    expenses.filter((r) => {
      const codeNum = parseInt(r.code, 10);
      return isNaN(codeNum) || codeNum >= 5800 || codeNum < 5100;
    }),
  );
  const totalOtherExpenseMinor = otherExpenseRows.reduce((s, r) => s + r.movementMinor, 0n);

  const grossProfitMinor = totalRevenueMinor - totalCogsMinor;
  const operatingIncomeMinor = grossProfitMinor - totalOperatingExpenseMinor;
  const netIncomeMinor =
    operatingIncomeMinor +
    totalOtherRevenueMinor -
    totalOtherExpenseMinor -
    totalTaxExpenseMinor;

  return {
    revenueRows,
    totalRevenueMinor,
    cogsRows,
    totalCogsMinor,
    grossProfitMinor,
    operatingExpenseRows,
    totalOperatingExpenseMinor,
    operatingIncomeMinor,
    otherRevenueRows,
    totalOtherRevenueMinor,
    otherExpenseRows,
    totalOtherExpenseMinor,
    taxExpenseRows,
    totalTaxExpenseMinor,
    netIncomeMinor,
  };
}
