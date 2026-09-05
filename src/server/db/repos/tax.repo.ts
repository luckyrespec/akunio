import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { Queryable } from "./queryable";
import { organizations, accounts } from "../schema/org";
import { journalEntries, journalLines } from "../schema/journal";
import { taxSummaries, type TaxSummaryRow } from "../schema/tax";
import {
  type TaxSettings,
  DEFAULT_TAX_SETTINGS,
  calculatePphFinal,
} from "@/core/tax/pph-final";
import { toMinor, postJournalEntry } from "./journals.repo";

export interface TaxSummaryView {
  id: string;
  orgId: string;
  periodMonth: string;
  taxYear: number;
  grossRevenueMinor: bigint;
  cumulativeYearRevenueMinor: bigint;
  taxableRevenueMinor: bigint;
  taxDueMinor: bigint;
  accrualDraftId: string | null;
  accrualJournalEntryId: string | null;
  paymentJournalEntryId: string | null;
  ntpn: string | null;
  paidAt: Date | null;
  status: "UNPROCESSED" | "DRAFTED" | "ACCRUED" | "PAID";
  createdAt: Date;
  updatedAt: Date;
}

function mapSummaryRow(r: TaxSummaryRow): TaxSummaryView {
  return {
    id: r.id,
    orgId: r.orgId,
    periodMonth: r.periodMonth,
    taxYear: r.taxYear,
    grossRevenueMinor: BigInt(r.grossRevenueMinor),
    cumulativeYearRevenueMinor: BigInt(r.cumulativeYearRevenueMinor),
    taxableRevenueMinor: BigInt(r.taxableRevenueMinor),
    taxDueMinor: BigInt(r.taxDueMinor),
    accrualDraftId: r.accrualDraftId,
    accrualJournalEntryId: r.accrualJournalEntryId,
    paymentJournalEntryId: r.paymentJournalEntryId,
    ntpn: r.ntpn,
    paidAt: r.paidAt,
    status: r.status as TaxSummaryView["status"],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function getTaxSettings(q: Queryable, orgId: string): Promise<TaxSettings> {
  const [org] = await q
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const orgSettings = (org?.settings ?? {}) as Record<string, unknown>;
  const taxConfig = (orgSettings.tax ?? {}) as Partial<TaxSettings>;

  return {
    ...DEFAULT_TAX_SETTINGS,
    ...taxConfig,
  };
}

export async function saveTaxSettings(
  q: Queryable,
  orgId: string,
  input: Partial<TaxSettings>
): Promise<TaxSettings> {
  const [org] = await q
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const currentSettings = ((org?.settings ?? {}) as Record<string, unknown>) || {};
  const currentTax = (currentSettings.tax ?? {}) as Partial<TaxSettings>;
  const mergedTax: TaxSettings = {
    ...DEFAULT_TAX_SETTINGS,
    ...currentTax,
    ...input,
  };

  const updatedSettings = {
    ...currentSettings,
    tax: mergedTax,
  };

  await q
    .update(organizations)
    .set({ settings: updatedSettings })
    .where(eq(organizations.id, orgId));

  return mergedTax;
}

/**
 * Agregasi peredaran bruto bulanan dari jurnal yang sudah POSTED untuk akun bertipe PENDAPATAN.
 * Normal balance pendapatan adalah Kredit, sehingga Gross Revenue = Kredit - Debit.
 */
export async function getMonthlyGrossRevenue(
  q: Queryable,
  orgId: string,
  year: number
): Promise<Map<string, bigint>> {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const rows = await q
    .select({
      month: sql<string>`to_char(${journalEntries.entryDate}, 'YYYY-MM')`,
      netCredit: sql<string>`COALESCE(SUM(${journalLines.credit} - ${journalLines.debit}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .where(
      and(
        eq(journalEntries.orgId, orgId),
        eq(journalEntries.status, "POSTED"),
        eq(accounts.type, "PENDAPATAN"),
        gte(journalEntries.entryDate, startDate),
        lte(journalEntries.entryDate, endDate)
      )
    )
    .groupBy(sql`to_char(${journalEntries.entryDate}, 'YYYY-MM')`);

  const result = new Map<string, bigint>();
  for (const r of rows) {
    const minor = toMinor(r.netCredit);
    result.set(r.month, minor > 0n ? minor : 0n);
  }

  return result;
}

export async function getTaxSummariesByYear(
  q: Queryable,
  orgId: string,
  year: number
): Promise<TaxSummaryView[]> {
  const rows = await q
    .select()
    .from(taxSummaries)
    .where(and(eq(taxSummaries.orgId, orgId), eq(taxSummaries.taxYear, year)))
    .orderBy(asc(taxSummaries.periodMonth));

  return rows.map(mapSummaryRow);
}

export async function getTaxSummaryByMonth(
  q: Queryable,
  orgId: string,
  periodMonth: string
): Promise<TaxSummaryView | null> {
  const [row] = await q
    .select()
    .from(taxSummaries)
    .where(and(eq(taxSummaries.orgId, orgId), eq(taxSummaries.periodMonth, periodMonth)))
    .limit(1);

  return row ? mapSummaryRow(row) : null;
}

/**
 * Menghitung ulang dan menyimpan rekapitulasi pajak untuk bulan tertentu.
 */
export async function upsertMonthlyTaxSummary(
  q: Queryable,
  orgId: string,
  periodMonth: string
): Promise<TaxSummaryView> {
  const year = parseInt(periodMonth.slice(0, 4), 10);
  const monthNum = parseInt(periodMonth.slice(5, 7), 10);

  const taxSettings = await getTaxSettings(q, orgId);
  const monthlyRevenues = await getMonthlyGrossRevenue(q, orgId, year);

  // Hitung kumulatif pendapatan bulan-bulan sebelumnya di tahun pajak yang sama
  let cumulativePriorRevenueMinor = 0n;
  for (let m = 1; m < monthNum; m++) {
    const mStr = `${year}-${String(m).padStart(2, "0")}`;
    cumulativePriorRevenueMinor += monthlyRevenues.get(mStr) ?? 0n;
  }

  const monthlyRevenueMinor = monthlyRevenues.get(periodMonth) ?? 0n;

  const calc = calculatePphFinal({
    monthlyRevenueMinor,
    cumulativePriorRevenueMinor,
    taxpayerType: taxSettings.taxpayerType,
  });

  // Cari apakah sudah ada draf / bukti bayar sebelumnya
  const existing = await getTaxSummaryByMonth(q, orgId, periodMonth);
  const status = existing?.status === "PAID" ? "PAID" : existing?.status === "ACCRUED" ? "ACCRUED" : existing?.accrualDraftId ? "DRAFTED" : "UNPROCESSED";

  const [row] = await q
    .insert(taxSummaries)
    .values({
      orgId,
      periodMonth,
      taxYear: year,
      grossRevenueMinor: calc.monthlyRevenueMinor,
      cumulativeYearRevenueMinor: calc.cumulativeNewRevenueMinor,
      taxableRevenueMinor: calc.taxableRevenueMinor,
      taxDueMinor: calc.taxDueMinor,
      status,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [taxSummaries.orgId, taxSummaries.periodMonth],
      set: {
        grossRevenueMinor: calc.monthlyRevenueMinor,
        cumulativeYearRevenueMinor: calc.cumulativeNewRevenueMinor,
        taxableRevenueMinor: calc.taxableRevenueMinor,
        taxDueMinor: calc.taxDueMinor,
        updatedAt: new Date(),
      },
    })
    .returning();

  return mapSummaryRow(row);
}

export interface SettleTaxPaymentInput {
  periodMonth: string;
  ntpn: string;
  paidAtISO: string;
  bankAccountId: string;
  actorEmail: string;
}

/**
 * Mencatat pelunasan bukti setor pajak (NTPN):
 * Memposting jurnal: Debit 2300 Utang PPh vs Kredit Kas/Bank
 * Memperbarui status tax_summaries menjadi PAID.
 */
export async function settleTaxPayment(
  q: Queryable,
  orgId: string,
  input: SettleTaxPaymentInput
): Promise<{ paymentEntryId: string; number: string }> {
  const summary = await getTaxSummaryByMonth(q, orgId, input.periodMonth);
  if (!summary) {
    throw new Error(`REKAPITULASI_PAJAK_TIDAK_DITEMUKAN: ${input.periodMonth}`);
  }
  if (summary.taxDueMinor <= 0n) {
    throw new Error("TIDAK_ADA_PAJAK_TERUTANG_UNTUK_DIBAYAR");
  }

  // Cari akun Utang PPh (2300)
  const [pphAccount] = await q
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.code, "2300")))
    .limit(1);

  if (!pphAccount) {
    throw new Error("AKUN_UTANG_PPH_2300_TIDAK_DITEMUKAN");
  }

  // Verifikasi akun Kas/Bank asal
  const [bankAccount] = await q
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.id, input.bankAccountId)))
    .limit(1);

  if (!bankAccount) {
    throw new Error("AKUN_KAS_BANK_TIDAK_DITEMUKAN");
  }

  // Posting Jurnal Pelunasan Pajak
  const postResult = await postJournalEntry(q, orgId, input.actorEmail, {
    dateISO: input.paidAtISO,
    memo: `Penyetoran PPh Final PP 55/2022 Periode ${input.periodMonth} (NTPN: ${input.ntpn.trim()})`,
    source: "TAX",
    lines: [
      {
        accountId: pphAccount.id,
        debitMinor: summary.taxDueMinor,
        creditMinor: 0n,
        memo: `Pelunasan PPh Final ${input.periodMonth}`,
      },
      {
        accountId: bankAccount.id,
        debitMinor: 0n,
        creditMinor: summary.taxDueMinor,
        memo: `NTPN ${input.ntpn.trim()}`,
      },
    ],
  });

  // Update status summary
  await q
    .update(taxSummaries)
    .set({
      status: "PAID",
      ntpn: input.ntpn.trim(),
      paidAt: new Date(input.paidAtISO),
      paymentJournalEntryId: postResult.id,
      updatedAt: new Date(),
    })
    .where(and(eq(taxSummaries.orgId, orgId), eq(taxSummaries.periodMonth, input.periodMonth)));

  return { paymentEntryId: postResult.id, number: postResult.number };
}
