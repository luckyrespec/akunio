import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Queryable } from "./queryable";
import {
  fixedAssets,
  assetDepreciationLines,
  assetDisposals,
} from "../schema/assets";
import { accounts } from "../schema/org";
import { postJournalEntry } from "./journals.repo";
import { calculateDepreciationSchedule } from "@/core/assets/depreciation";
import { calculateAssetDisposal } from "@/core/assets/disposal";

export interface CreateFixedAssetInput {
  orgId: string;
  name: string;
  category: "TANAH" | "BANGUNAN" | "KENDARAAN" | "MESIN_PERALATAN" | "INVENTARIS_KANTOR";
  acquisitionDate: string; // YYYY-MM-DD
  inServiceDate: string; // YYYY-MM-DD
  acquisitionCostMinor: bigint;
  salvageValueMinor?: bigint;
  usefulLifeMonths: number;
  depreciationMethod: "STRAIGHT_LINE" | "DECLINING_BALANCE";
  depreciationRatePercent?: number;
  assetAccountId: string;
  accumulatedDepAccountId: string;
  depreciationExpenseAccountId: string;
  notes?: string;
}

export async function createFixedAsset(
  q: Queryable,
  input: CreateFixedAssetInput,
) {
  const currentYear = input.acquisitionDate.slice(0, 4);

  // Generate unique code AST-YYYY-NNNN
  const [lastAsset] = await q
    .select({ code: fixedAssets.code })
    .from(fixedAssets)
    .where(and(eq(fixedAssets.orgId, input.orgId)))
    .orderBy(desc(fixedAssets.createdAt))
    .limit(1);

  let nextSeq = 1;
  if (lastAsset?.code) {
    const match = lastAsset.code.match(/AST-\d{4}-(\d+)/);
    if (match) {
      nextSeq = parseInt(match[1], 10) + 1;
    }
  }
  const code = `AST-${currentYear}-${String(nextSeq).padStart(4, "0")}`;

  const [asset] = await q
    .insert(fixedAssets)
    .values({
      orgId: input.orgId,
      code,
      name: input.name,
      category: input.category,
      acquisitionDate: input.acquisitionDate,
      inServiceDate: input.inServiceDate,
      acquisitionCostMinor: input.acquisitionCostMinor,
      salvageValueMinor: input.salvageValueMinor ?? 0n,
      usefulLifeMonths: input.usefulLifeMonths,
      depreciationMethod: input.depreciationMethod,
      depreciationRatePercent: input.depreciationRatePercent
        ? input.depreciationRatePercent.toFixed(2)
        : null,
      assetAccountId: input.assetAccountId,
      accumulatedDepAccountId: input.accumulatedDepAccountId,
      depreciationExpenseAccountId: input.depreciationExpenseAccountId,
      status: "ACTIVE",
      notes: input.notes,
    })
    .returning();

  // Generate and insert scheduled depreciation lines (unless TANAH which does not depreciate)
  if (input.category !== "TANAH") {
    const schedule = calculateDepreciationSchedule({
      acquisitionCostMinor: input.acquisitionCostMinor,
      salvageValueMinor: input.salvageValueMinor ?? 0n,
      usefulLifeMonths: input.usefulLifeMonths,
      inServiceDate: input.inServiceDate,
      method: input.depreciationMethod,
      decliningRatePercent: input.depreciationRatePercent,
    });

    if (schedule.length > 0) {
      await q.insert(assetDepreciationLines).values(
        schedule.map((item) => ({
          orgId: input.orgId,
          assetId: asset.id,
          periodName: item.periodName,
          depreciationDate: item.depreciationDate,
          depreciationAmountMinor: item.depreciationAmountMinor,
          accumulatedDepreciationMinor: item.accumulatedDepreciationMinor,
          bookValueMinor: item.bookValueMinor,
          status: "SCHEDULED" as const,
        })),
      );
    }
  }

  return asset;
}

export async function listFixedAssets(q: Queryable, orgId: string) {
  return q
    .select()
    .from(fixedAssets)
    .where(eq(fixedAssets.orgId, orgId))
    .orderBy(desc(fixedAssets.createdAt));
}

export interface AssetSearchHit {
  id: string;
  code: string;
  name: string;
  status: string;
  acquisitionCostMinor: bigint;
}

/** Cari aset berdasar nama/kode/keterangan, plus nominal harga perolehan bila ada. */
export async function searchAssets(
  q: Queryable,
  orgId: string,
  term: string,
  amountMinor: bigint | null,
  limit = 5,
): Promise<AssetSearchHit[]> {
  const like = `%${term}%`;
  const textMatch = or(
    ilike(fixedAssets.name, like),
    ilike(fixedAssets.code, like),
    ilike(fixedAssets.notes, like),
  );
  const rows = await q
    .select({
      id: fixedAssets.id,
      code: fixedAssets.code,
      name: fixedAssets.name,
      status: fixedAssets.status,
      acquisitionCostMinor: fixedAssets.acquisitionCostMinor,
    })
    .from(fixedAssets)
    .where(
      and(
        eq(fixedAssets.orgId, orgId),
        amountMinor !== null
          ? or(textMatch, eq(fixedAssets.acquisitionCostMinor, amountMinor))
          : textMatch,
      ),
    )
    .orderBy(desc(fixedAssets.createdAt))
    .limit(limit);
  return rows;
}

export async function getFixedAssetDetail(
  q: Queryable,
  orgId: string,
  assetId: string,
) {
  const [asset] = await q
    .select()
    .from(fixedAssets)
    .where(and(eq(fixedAssets.orgId, orgId), eq(fixedAssets.id, assetId)));

  if (!asset) return null;

  const schedule = await q
    .select()
    .from(assetDepreciationLines)
    .where(
      and(
        eq(assetDepreciationLines.orgId, orgId),
        eq(assetDepreciationLines.assetId, assetId),
      ),
    )
    .orderBy(assetDepreciationLines.depreciationDate);

  const [disposal] = await q
    .select()
    .from(assetDisposals)
    .where(
      and(
        eq(assetDisposals.orgId, orgId),
        eq(assetDisposals.assetId, assetId),
      ),
    );

  return { asset, schedule, disposal: disposal ?? null };
}

export async function postMonthlyDepreciation(
  q: Queryable,
  params: {
    orgId: string;
    periodName: string; // YYYY-MM
    postedBy: string;
  },
) {
  const { orgId, periodName, postedBy } = params;

  // Find all scheduled depreciation lines for this period across all active assets
  const lines = await q
    .select({
      lineId: assetDepreciationLines.id,
      assetId: assetDepreciationLines.assetId,
      amountMinor: assetDepreciationLines.depreciationAmountMinor,
      depDate: assetDepreciationLines.depreciationDate,
      assetName: fixedAssets.name,
      expenseAccountId: fixedAssets.depreciationExpenseAccountId,
      accumAccountId: fixedAssets.accumulatedDepAccountId,
    })
    .from(assetDepreciationLines)
    .innerJoin(fixedAssets, eq(assetDepreciationLines.assetId, fixedAssets.id))
    .where(
      and(
        eq(assetDepreciationLines.orgId, orgId),
        eq(assetDepreciationLines.periodName, periodName),
        eq(assetDepreciationLines.status, "SCHEDULED"),
        eq(fixedAssets.status, "ACTIVE"),
      ),
    );

  if (lines.length === 0) {
    return { postedCount: 0, journalEntryId: null };
  }

  // Filter out zero amount lines
  const validLines = lines.filter((l) => l.amountMinor > 0n);
  if (validLines.length === 0) {
    // Mark zero amount lines as POSTED
    await q
      .update(assetDepreciationLines)
      .set({ status: "POSTED" })
      .where(
        inArray(
          assetDepreciationLines.id,
          lines.map((l) => l.lineId),
        ),
      );
    return { postedCount: lines.length, journalEntryId: null };
  }

  // Group debit by expenseAccountId and credit by accumAccountId
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

  // Post official journal entry
  const depDate = validLines[0].depDate;
  const journalResult = await postJournalEntry(q, orgId, postedBy, {
    dateISO: depDate,
    memo: `Penyusutan Aset Tetap Periode ${periodName}`,
    source: "AI",
    idempotencyKey: `dep-${orgId}-${periodName}`,
    lines: glLines,
  });

  // Mark lines as POSTED and link journalEntryId
  await q
    .update(assetDepreciationLines)
    .set({
      status: "POSTED",
      journalEntryId: journalResult.id,
    })
    .where(
      inArray(
        assetDepreciationLines.id,
        lines.map((l) => l.lineId),
      ),
    );

  // Check if any assets are now fully depreciated
  for (const l of lines) {
    const remaining = await q
      .select({ id: assetDepreciationLines.id })
      .from(assetDepreciationLines)
      .where(
        and(
          eq(assetDepreciationLines.assetId, l.assetId),
          eq(assetDepreciationLines.status, "SCHEDULED"),
        ),
      )
      .limit(1);

    if (remaining.length === 0) {
      await q
        .update(fixedAssets)
        .set({ status: "FULLY_DEPRECIATED" })
        .where(eq(fixedAssets.id, l.assetId));
    }
  }

  return { postedCount: lines.length, journalEntryId: journalResult.id };
}

export async function disposeAsset(
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
    .from(fixedAssets)
    .where(and(eq(fixedAssets.orgId, orgId), eq(fixedAssets.id, assetId)));

  if (!asset) throw new Error("ASET_TIDAK_DITEMUKAN");
  if (asset.status === "DISPOSED") throw new Error("ASET_SUDAH_DILEPAS");

  // Sum total accumulated depreciation already posted
  const postedDepLines = await q
    .select({
      totalDep: sql<string>`COALESCE(SUM(depreciation_amount_minor), 0)`,
    })
    .from(assetDepreciationLines)
    .where(
      and(
        eq(assetDepreciationLines.orgId, orgId),
        eq(assetDepreciationLines.assetId, assetId),
        eq(assetDepreciationLines.status, "POSTED"),
      ),
    );

  const accumulatedDepreciationMinor = BigInt(postedDepLines[0]?.totalDep ?? "0");

  const calc = calculateAssetDisposal({
    acquisitionCostMinor: asset.acquisitionCostMinor,
    accumulatedDepreciationMinor,
    proceedsMinor,
    assetAccountId: asset.assetAccountId,
    accumulatedDepAccountId: asset.accumulatedDepAccountId,
    depositAccountId,
    gainLossAccountId,
    assetName: asset.name,
  });

  // Post disposal journal
  const jeResult = await postJournalEntry(q, orgId, postedBy, {
    dateISO: disposalDate,
    memo: `Pelepasan Aset Tetap: ${asset.name} (${asset.code})`,
    source: "MANUAL",
    idempotencyKey: `disposal-${asset.id}`,
    lines: calc.journalLines.map((l) => ({
      accountId: l.accountId,
      debitMinor: l.debitMinor,
      creditMinor: l.creditMinor,
    })),
  });

  // Insert into asset_disposals
  await q.insert(assetDisposals).values({
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

  // Update asset status to DISPOSED
  await q
    .update(fixedAssets)
    .set({ status: "DISPOSED" })
    .where(eq(fixedAssets.id, assetId));

  // Cancel/delete any remaining SCHEDULED depreciation lines for this asset
  await q
    .delete(assetDepreciationLines)
    .where(
      and(
        eq(assetDepreciationLines.assetId, assetId),
        eq(assetDepreciationLines.status, "SCHEDULED"),
      ),
    );

  return {
    journalEntryId: jeResult.id,
    gainLossMinor: calc.gainLossMinor,
    bookValueAtDisposalMinor: calc.bookValueAtDisposalMinor,
  };
}
