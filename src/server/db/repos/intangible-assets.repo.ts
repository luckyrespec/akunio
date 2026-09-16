import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import type { Queryable } from "./queryable";
import {
  intangibleAssets,
  intangibleAmortizationLines,
  intangibleDisposals,
} from "../schema/intangible";
import { findEntryByIdempotencyKey, postJournalEntry } from "./journals.repo";
import { calculateAmortizationSchedule } from "@/core/assets/amortization";
import { calculateAssetDisposal } from "@/core/assets/disposal";

export type IntangibleCategory =
  | "LISENSI_SOFTWARE"
  | "HAK_CIPTA"
  | "PATEN"
  | "MEREK_DAGANG"
  | "GOODWILL"
  | "LAINNYA";

export interface CreateIntangibleInput {
  orgId: string;
  name: string;
  category: IntangibleCategory;
  acquisitionDate: string; // YYYY-MM-DD
  inServiceDate: string; // YYYY-MM-DD
  acquisitionCostMinor: bigint;
  usefulLifeMonths: number;
  assetAccountId: string;
  accumulatedAccountId: string;
  amortizationExpenseAccountId: string;
  notes?: string;
  acquisitionPosted?: boolean;
}

export async function nextIntangibleCode(
  q: Queryable,
  orgId: string,
  year: number,
): Promise<string> {
  // WAJIB dalam transaksi pemanggil: xact lock menyerikan upsert counter
  // per org-tahun akuisisi, reset tiap tahun (pola ast_seq_counters).
  await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`itb:${orgId}:${year}`}))`);
  const res = await q.execute(sql`
    INSERT INTO itb_seq_counters (org_id, year, last_seq)
    VALUES (${orgId}, ${year}, 1)
    ON CONFLICT (org_id, year)
    DO UPDATE SET last_seq = itb_seq_counters.last_seq + 1
    RETURNING last_seq
  `);
  const seq = Number((res.rows?.[0] as { last_seq: number } | undefined)?.last_seq ?? 1);
  return `ITB-${year}-${String(seq).padStart(4, "0")}`;
}

export async function createIntangible(
  q: Queryable,
  input: CreateIntangibleInput,
) {
  const acquisitionYear = Number(input.acquisitionDate.slice(0, 4));

  // Generate unique code ITB-YYYY-NNNN
  const code = await nextIntangibleCode(q, input.orgId, acquisitionYear);

  const [asset] = await q
    .insert(intangibleAssets)
    .values({
      orgId: input.orgId,
      code,
      name: input.name,
      category: input.category,
      acquisitionDate: input.acquisitionDate,
      inServiceDate: input.inServiceDate,
      acquisitionCostMinor: input.acquisitionCostMinor,
      usefulLifeMonths: input.usefulLifeMonths,
      amortizationMethod: "STRAIGHT_LINE",
      assetAccountId: input.assetAccountId,
      accumulatedAccountId: input.accumulatedAccountId,
      amortizationExpenseAccountId: input.amortizationExpenseAccountId,
      status: "ACTIVE",
      acquisitionPosted: input.acquisitionPosted ?? false,
      notes: input.notes,
    })
    .returning();

  const schedule = calculateAmortizationSchedule({
    acquisitionCostMinor: input.acquisitionCostMinor,
    usefulLifeMonths: input.usefulLifeMonths,
    inServiceDate: input.inServiceDate,
  });

  if (schedule.length > 0) {
    await q.insert(intangibleAmortizationLines).values(
      schedule.map((item) => ({
        orgId: input.orgId,
        assetId: asset.id,
        periodName: item.periodName,
        amortizationDate: item.amortizationDate,
        amortizationAmountMinor: item.amortizationAmountMinor,
        accumulatedMinor: item.accumulatedMinor,
        bookValueMinor: item.bookValueMinor,
        status: "SCHEDULED" as const,
      })),
    );
  }

  return asset;
}

export async function listIntangibles(q: Queryable, orgId: string) {
  return q
    .select()
    .from(intangibleAssets)
    .where(eq(intangibleAssets.orgId, orgId))
    .orderBy(desc(intangibleAssets.createdAt));
}

export async function getIntangibleDetail(
  q: Queryable,
  orgId: string,
  assetId: string,
) {
  const [asset] = await q
    .select()
    .from(intangibleAssets)
    .where(and(eq(intangibleAssets.orgId, orgId), eq(intangibleAssets.id, assetId)));

  if (!asset) return null;

  const schedule = await q
    .select()
    .from(intangibleAmortizationLines)
    .where(
      and(
        eq(intangibleAmortizationLines.orgId, orgId),
        eq(intangibleAmortizationLines.assetId, assetId),
      ),
    )
    .orderBy(intangibleAmortizationLines.amortizationDate);

  const [disposal] = await q
    .select()
    .from(intangibleDisposals)
    .where(
      and(
        eq(intangibleDisposals.orgId, orgId),
        eq(intangibleDisposals.assetId, assetId),
      ),
    );

  return { asset, schedule, disposal: disposal ?? null };
}

export async function postMonthlyAmortization(
  q: Queryable,
  params: {
    orgId: string;
    periodName: string; // YYYY-MM
    postedBy: string;
  },
) {
  const { orgId, periodName, postedBy } = params;
  const idempotencyKey = `amor-${orgId}-${periodName}`;

  // Serikan run amortisasi konkuren per org+periode (pola postMonthlyDepreciation).
  await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`amor:${orgId}:${periodName}`}))`);

  const lines = await q
    .select({
      lineId: intangibleAmortizationLines.id,
      assetId: intangibleAmortizationLines.assetId,
      amountMinor: intangibleAmortizationLines.amortizationAmountMinor,
      amorDate: intangibleAmortizationLines.amortizationDate,
      assetName: intangibleAssets.name,
      expenseAccountId: intangibleAssets.amortizationExpenseAccountId,
      accumAccountId: intangibleAssets.accumulatedAccountId,
    })
    .from(intangibleAmortizationLines)
    .innerJoin(intangibleAssets, eq(intangibleAmortizationLines.assetId, intangibleAssets.id))
    .where(
      and(
        eq(intangibleAmortizationLines.orgId, orgId),
        eq(intangibleAmortizationLines.periodName, periodName),
        eq(intangibleAmortizationLines.status, "SCHEDULED"),
        eq(intangibleAssets.status, "ACTIVE"),
      ),
    );

  if (lines.length === 0) {
    const existing = await findEntryByIdempotencyKey(q, orgId, idempotencyKey);
    return { postedCount: 0, journalEntryId: existing?.id ?? null };
  }

  const validLines = lines.filter((l) => l.amountMinor > 0n);
  if (validLines.length === 0) {
    await q
      .update(intangibleAmortizationLines)
      .set({ status: "POSTED" })
      .where(
        inArray(
          intangibleAmortizationLines.id,
          lines.map((l) => l.lineId),
        ),
      );
    return { postedCount: lines.length, journalEntryId: null };
  }

  const debitMap = new Map<string, bigint>();
  const creditMap = new Map<string, bigint>();

  for (const l of validLines) {
    debitMap.set(
      l.expenseAccountId,
      (debitMap.get(l.expenseAccountId) ?? 0n) + l.amountMinor,
    );
    creditMap.set(
      l.accumAccountId,
      (creditMap.get(l.accumAccountId) ?? 0n) + l.amountMinor,
    );
  }

  const glLines: Array<{
    accountId: string;
    debitMinor: bigint;
    creditMinor: bigint;
  }> = [];

  for (const [accountId, debitMinor] of debitMap.entries()) {
    glLines.push({ accountId, debitMinor, creditMinor: 0n });
  }
  for (const [accountId, creditMinor] of creditMap.entries()) {
    glLines.push({ accountId, debitMinor: 0n, creditMinor });
  }

  const amorDate = validLines[0].amorDate;
  const journalResult = await postJournalEntry(q, orgId, postedBy, {
    dateISO: amorDate,
    memo: `Amortisasi ${periodName}`,
    source: "MANUAL",
    idempotencyKey,
    lines: glLines,
  });

  await q
    .update(intangibleAmortizationLines)
    .set({
      status: "POSTED",
      journalEntryId: journalResult.id,
    })
    .where(
      inArray(
        intangibleAmortizationLines.id,
        lines.map((l) => l.lineId),
      ),
    );

  // Aset yang tak bersisa jadwal → FULLY_AMORTIZED.
  for (const l of lines) {
    const remaining = await q
      .select({ id: intangibleAmortizationLines.id })
      .from(intangibleAmortizationLines)
      .where(
        and(
          eq(intangibleAmortizationLines.assetId, l.assetId),
          eq(intangibleAmortizationLines.status, "SCHEDULED"),
        ),
      )
      .limit(1);

    if (remaining.length === 0) {
      await q
        .update(intangibleAssets)
        .set({ status: "FULLY_AMORTIZED" })
        .where(eq(intangibleAssets.id, l.assetId));
    }
  }

  return { postedCount: lines.length, journalEntryId: journalResult.id };
}

export async function disposeIntangible(
  q: Queryable,
  params: {
    orgId: string;
    assetId: string;
    disposalDate: string; // YYYY-MM-DD
    disposalType: "SALE" | "SCRAP" | "WRITE_OFF";
    proceedsMinor: bigint;
    depositAccountId?: string;
    gainLossAccountId: string;
    notes?: string;
    postedBy: string;
  },
) {
  const {
    orgId,
    assetId,
    disposalDate,
    disposalType,
    proceedsMinor,
    depositAccountId,
    gainLossAccountId,
    notes,
    postedBy,
  } = params;

  const [asset] = await q
    .select()
    .from(intangibleAssets)
    .where(and(eq(intangibleAssets.orgId, orgId), eq(intangibleAssets.id, assetId)));

  if (!asset) throw new Error("ASET_TIDAK_DITEMUKAN");
  if (asset.status === "DISPOSED") throw new Error("ASET_SUDAH_DILEPAS");

  if (disposalType === "SALE" && !depositAccountId) {
    throw new Error("KAS_PENJUALAN_WAJIB");
  }
  if (proceedsMinor > 0n && !depositAccountId) {
    throw new Error("KAS_PENJUALAN_WAJIB");
  }

  // Amortisasi terjadwal bertanggal <= tanggal pelepasan wajib diposting dulu.
  const pendingAmor = await q
    .select({ id: intangibleAmortizationLines.id })
    .from(intangibleAmortizationLines)
    .where(
      and(
        eq(intangibleAmortizationLines.orgId, orgId),
        eq(intangibleAmortizationLines.assetId, assetId),
        eq(intangibleAmortizationLines.status, "SCHEDULED"),
        lte(intangibleAmortizationLines.amortizationDate, disposalDate),
      ),
    )
    .limit(1);
  if (pendingAmor.length > 0) throw new Error("AMORTISASI_BELUM_POSTING");

  const postedAmorLines = await q
    .select({
      totalAmor: sql<string>`COALESCE(SUM(amortization_amount_minor), 0)`,
    })
    .from(intangibleAmortizationLines)
    .where(
      and(
        eq(intangibleAmortizationLines.orgId, orgId),
        eq(intangibleAmortizationLines.assetId, assetId),
        eq(intangibleAmortizationLines.status, "POSTED"),
      ),
    );

  const accumulatedMinor = BigInt(postedAmorLines[0]?.totalAmor ?? "0");

  // Matematika pelepasan generik (akun-akun dilewatkan dari aset takberwujud).
  const calc = calculateAssetDisposal({
    acquisitionCostMinor: asset.acquisitionCostMinor,
    accumulatedDepreciationMinor: accumulatedMinor,
    proceedsMinor,
    assetAccountId: asset.assetAccountId,
    accumulatedDepAccountId: asset.accumulatedAccountId,
    depositAccountId,
    gainLossAccountId,
    assetName: asset.name,
  });

  const jeResult = await postJournalEntry(q, orgId, postedBy, {
    dateISO: disposalDate,
    memo: `Pelepasan Aset Takberwujud: ${asset.name} (${asset.code})`,
    source: "MANUAL",
    idempotencyKey: `intangible-disposal-${asset.id}`,
    lines: calc.journalLines.map((l) => ({
      accountId: l.accountId,
      debitMinor: l.debitMinor,
      creditMinor: l.creditMinor,
    })),
  });

  await q.insert(intangibleDisposals).values({
    orgId,
    assetId,
    disposalDate,
    disposalType,
    proceedsMinor,
    bookValueAtDisposalMinor: calc.bookValueAtDisposalMinor,
    gainLossMinor: calc.gainLossMinor,
    depositAccountId: depositAccountId ?? null,
    gainLossAccountId,
    journalEntryId: jeResult.id,
    notes: notes ?? null,
  });

  await q
    .update(intangibleAssets)
    .set({ status: "DISPOSED" })
    .where(eq(intangibleAssets.id, assetId));

  await q
    .delete(intangibleAmortizationLines)
    .where(
      and(
        eq(intangibleAmortizationLines.assetId, assetId),
        eq(intangibleAmortizationLines.status, "SCHEDULED"),
      ),
    );

  return {
    journalEntryId: jeResult.id,
    gainLossMinor: calc.gainLossMinor,
    bookValueAtDisposalMinor: calc.bookValueAtDisposalMinor,
  };
}
