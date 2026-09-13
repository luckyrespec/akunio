import { and, desc, eq, ilike, inArray, lte, or, sql } from "drizzle-orm";
import type { Queryable } from "./queryable";
import {
  fixedAssets,
  assetDepreciationLines,
  assetDisposals,
} from "../schema/assets";
import { accounts } from "../schema/org";
import { findEntryByIdempotencyKey, postJournalEntry } from "./journals.repo";
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
  acquisitionPosted?: boolean;
}

export async function nextAssetCode(
  q: Queryable,
  orgId: string,
  year: number,
): Promise<string> {
  // WAJIB dalam transaksi pemanggil: xact lock menyerikan upsert counter
  // per org-tahun akuisisi, reset tiap tahun (pola pos_sale_seq_counters).
  await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`ast:${orgId}:${year}`}))`);
  const res = await q.execute(sql`
    INSERT INTO ast_seq_counters (org_id, year, last_seq)
    VALUES (${orgId}, ${year}, 1)
    ON CONFLICT (org_id, year)
    DO UPDATE SET last_seq = ast_seq_counters.last_seq + 1
    RETURNING last_seq
  `);
  const seq = Number((res.rows?.[0] as { last_seq: number } | undefined)?.last_seq ?? 1);
  return `AST-${year}-${String(seq).padStart(4, "0")}`;
}

export async function createFixedAsset(
  q: Queryable,
  input: CreateFixedAssetInput,
) {
  const acquisitionYear = Number(input.acquisitionDate.slice(0, 4));

  // Generate unique code AST-YYYY-NNNN
  const code = await nextAssetCode(q, input.orgId, acquisitionYear);

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
      acquisitionPosted: input.acquisitionPosted ?? false,
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
  const idempotencyKey = `dep-${orgId}-${periodName}`;

  // Serikan run susut konkuren per org+periode: pemenang posting satu jurnal,
  // yang kalah menunggu lock lalu runtuh ke jurnal yang sama (kontrak idempotency).
  await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`dep:${orgId}:${periodName}`}))`);

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
    // Tak ada baris terjadwal: bila jurnal periode ini sudah ada (run ganda
    // konkuren — pemenang sudah komit), kembalikan jurnal yang sama.
    const existing = await findEntryByIdempotencyKey(q, orgId, idempotencyKey);
    return { postedCount: 0, journalEntryId: existing?.id ?? null };
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
    memo: `Penyusutan ${periodName}`,
    source: "MANUAL",
    idempotencyKey,
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

  // Penjualan wajib menunjuk akun Kas/Bank penerima hasil penjualan.
  if (disposalType === "SALE" && !depositAccountId) {
    throw new Error("KAS_PENJUALAN_WAJIB");
  }
  if (proceedsMinor > 0n && !depositAccountId) {
    throw new Error("KAS_PENJUALAN_WAJIB");
  }

  // Susut terjadwal yang tanggalnya <= tanggal pelepasan wajib diposting dulu
  // agar nilai buku saat disposal sudah final.
  const pendingDep = await q
    .select({ id: assetDepreciationLines.id })
    .from(assetDepreciationLines)
    .where(
      and(
        eq(assetDepreciationLines.orgId, orgId),
        eq(assetDepreciationLines.assetId, assetId),
        eq(assetDepreciationLines.status, "SCHEDULED"),
        lte(assetDepreciationLines.depreciationDate, disposalDate),
      ),
    )
    .limit(1);
  if (pendingDep.length > 0) throw new Error("SUSUT_BELUM_POSTING");

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
