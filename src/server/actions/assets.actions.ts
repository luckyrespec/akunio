"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireContext } from "@/server/auth/guard";
import { isRedirectError } from "./redirect-guard";
import { db } from "@/server/db";
import { withOrg } from "@/server/db/repos/with-org";
import { fixedAssets } from "@/server/db/schema/assets";
import { appendAudit } from "@/server/db/repos/audit.repo";
import {
  createFixedAsset,
  listFixedAssets,
  getFixedAssetDetail,
  postMonthlyDepreciation,
  disposeAsset,
  type CreateFixedAssetInput,
} from "@/server/db/repos/assets.repo";
import { postJournalEntry } from "@/server/db/repos/journals.repo";
import { buildAcquisitionJournal } from "@/core/assets/acquisition";
import { Money } from "@/core/money/money";

export interface AssetActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

function fail<T = unknown>(e: unknown): AssetActionResult<T> {
  if (isRedirectError(e)) throw e;
  if (e instanceof Error) {
    if (e.message === "FORBIDDEN_AKSES") {
      return { ok: false, error: "Anda tidak memiliki izin untuk aksi ini." };
    }
    return { ok: false, error: e.message };
  }
  console.error(e);
  return { ok: false, error: "Terjadi kesalahan tak terduga." };
}

export async function createFixedAssetAction(payload: {
  name: string;
  category: "TANAH" | "BANGUNAN" | "KENDARAAN" | "MESIN_PERALATAN" | "INVENTARIS_KANTOR";
  acquisitionDate: string;
  inServiceDate: string;
  acquisitionCostText: string;
  salvageValueText?: string;
  usefulLifeMonths: number;
  depreciationMethod: "STRAIGHT_LINE" | "DECLINING_BALANCE";
  depreciationRatePercent?: number;
  assetAccountId: string;
  accumulatedDepAccountId: string;
  depreciationExpenseAccountId: string;
  notes?: string;
}): Promise<AssetActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const costMinor = Money.parseIdr(payload.acquisitionCostText).minor;
    const salvageMinor = payload.salvageValueText
      ? Money.parseIdr(payload.salvageValueText).minor
      : 0n;

    const asset = await withOrg(ctx.orgId, async (tx) => {
      const r = await createFixedAsset(tx, {
        orgId: ctx.orgId,
        name: payload.name.trim(),
        category: payload.category,
        acquisitionDate: payload.acquisitionDate,
        inServiceDate: payload.inServiceDate,
        acquisitionCostMinor: costMinor,
        salvageValueMinor: salvageMinor,
        usefulLifeMonths: payload.usefulLifeMonths,
        depreciationMethod: payload.depreciationMethod,
        depreciationRatePercent: payload.depreciationRatePercent,
        assetAccountId: payload.assetAccountId,
        accumulatedDepAccountId: payload.accumulatedDepAccountId,
        depreciationExpenseAccountId: payload.depreciationExpenseAccountId,
        acquisitionPosted: false,
        notes: payload.notes?.trim(),
      });

      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "JOURNAL_POST",
        subjectType: "fixed_asset",
        subjectId: r.id,
        data: { code: r.code, name: r.name, cost: costMinor.toString() },
      });

      return r;
    });

    revalidatePath("/aset");
    return { ok: true, data: asset };
  } catch (err) {
    return fail(err);
  }
}

export async function createAssetWithAcquisitionAction(payload: {
  name: string;
  category: "TANAH" | "BANGUNAN" | "KENDARAAN" | "MESIN_PERALATAN" | "INVENTARIS_KANTOR";
  acquisitionDate: string;
  inServiceDate: string;
  acquisitionCostText: string;
  salvageValueText?: string;
  usefulLifeMonths: number;
  depreciationMethod: "STRAIGHT_LINE" | "DECLINING_BALANCE";
  depreciationRatePercent?: number;
  assetAccountId: string;
  accumulatedDepAccountId: string;
  depreciationExpenseAccountId: string;
  notes?: string;
  postAcquisition: boolean;
  counterAccountId?: string;
}): Promise<AssetActionResult<{ asset: { id: string }; journalEntryId: string | null }>> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const costMinor = Money.parseIdr(payload.acquisitionCostText).minor;
    const salvageMinor = payload.salvageValueText
      ? Money.parseIdr(payload.salvageValueText).minor
      : 0n;

    if (payload.postAcquisition && !payload.counterAccountId) {
      return { ok: false, error: "Pilih akun lawan untuk jurnal perolehan (Kas/Bank, Utang, atau Modal)." };
    }

    const result = await withOrg(ctx.orgId, async (tx) => {
      const asset = await createFixedAsset(tx, {
        orgId: ctx.orgId,
        name: payload.name.trim(),
        category: payload.category,
        acquisitionDate: payload.acquisitionDate,
        inServiceDate: payload.inServiceDate,
        acquisitionCostMinor: costMinor,
        salvageValueMinor: salvageMinor,
        usefulLifeMonths: payload.usefulLifeMonths,
        depreciationMethod: payload.depreciationMethod,
        depreciationRatePercent: payload.depreciationRatePercent,
        assetAccountId: payload.assetAccountId,
        accumulatedDepAccountId: payload.accumulatedDepAccountId,
        depreciationExpenseAccountId: payload.depreciationExpenseAccountId,
        acquisitionPosted: payload.postAcquisition,
        notes: payload.notes?.trim(),
      });

      let journalEntryId: string | null = null;
      if (payload.postAcquisition && payload.counterAccountId) {
        const je = await postJournalEntry(
          tx,
          ctx.orgId,
          ctx.userEmail,
          buildAcquisitionJournal({
            assetId: asset.id,
            assetCode: asset.code,
            assetName: asset.name,
            assetAccountId: payload.assetAccountId,
            counterAccountId: payload.counterAccountId,
            acquisitionCostMinor: costMinor,
            acquisitionDate: payload.acquisitionDate,
          }),
        );
        journalEntryId = je.id;
      }

      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "ASSET_REGISTER",
        subjectType: "fixed_asset",
        subjectId: asset.id,
        data: { code: asset.code, name: asset.name, cost: costMinor.toString(), journalEntryId },
      });

      return { asset: { id: asset.id }, journalEntryId };
    });

    revalidatePath("/aset");
    revalidatePath("/jurnal");
    return { ok: true, data: result };
  } catch (err) {
    return fail(err);
  }
}

export async function listFixedAssetsAction(): Promise<AssetActionResult> {  try {
    const ctx = await requireContext();
    const assets = await listFixedAssets(db, ctx.orgId);
    return { ok: true, data: assets };
  } catch (err) {
    return fail(err);
  }
}

export async function getFixedAssetDetailAction(id: string): Promise<AssetActionResult> {
  try {
    const ctx = await requireContext();
    const detail = await getFixedAssetDetail(db, ctx.orgId, id);
    if (!detail) return { ok: false, error: "Aset tidak ditemukan." };
    return { ok: true, data: detail };
  } catch (err) {
    return fail(err);
  }
}

export async function postMonthlyDepreciationAction(
  periodName: string,
): Promise<AssetActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const result = await withOrg(ctx.orgId, async (tx) => {
      const r = await postMonthlyDepreciation(tx, {
        orgId: ctx.orgId,
        periodName,
        postedBy: ctx.userEmail,
      });

      if (r.journalEntryId) {
        await appendAudit(tx, {
          orgId: ctx.orgId,
          actor: ctx.userEmail,
          action: "JOURNAL_POST",
          subjectType: "depreciation_run",
          subjectId: r.journalEntryId,
          data: { periodName, postedCount: r.postedCount },
        });
      }

      return r;
    });

    revalidatePath("/aset");
    revalidatePath("/jurnal");
    revalidatePath("/tutup-buku");
    return { ok: true, data: result };
  } catch (err) {
    return fail(err);
  }
}

export async function disposeAssetAction(payload: {
  assetId: string;
  disposalDate: string;
  disposalType: "SALE" | "SCRAP" | "WRITE_OFF";
  proceedsText: string;
  depositAccountId?: string;
  gainLossAccountId: string;
  notes?: string;
}): Promise<AssetActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const proceedsMinor = Money.parseIdr(payload.proceedsText || "0").minor;

    const result = await withOrg(ctx.orgId, async (tx) => {
      const r = await disposeAsset(tx, {
        orgId: ctx.orgId,
        assetId: payload.assetId,
        disposalDate: payload.disposalDate,
        disposalType: payload.disposalType,
        proceedsMinor,
        depositAccountId: payload.depositAccountId,
        gainLossAccountId: payload.gainLossAccountId,
        notes: payload.notes?.trim(),
        postedBy: ctx.userEmail,
      });

      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "JOURNAL_POST",
        subjectType: "asset_disposal",
        subjectId: payload.assetId,
        data: {
          journalEntryId: r.journalEntryId,
          gainLossMinor: r.gainLossMinor.toString(),
        },
      });

      return r;
    });

    revalidatePath("/aset");
    revalidatePath(`/aset/${payload.assetId}`);
    revalidatePath("/jurnal");
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof Error && err.message === "KAS_PENJUALAN_WAJIB") {
      return { ok: false, error: "Penjualan aset wajib memilih akun Kas/Bank penerima hasil penjualan." };
    }
    if (err instanceof Error && err.message === "SUSUT_BELUM_POSTING") {
      return { ok: false, error: "Posting penyusutan terjadwal sampai tanggal pelepasan terlebih dahulu sebelum melepas aset." };
    }
    return fail(err);
  }
}

/**
 * Rincian satu aset tetap untuk sheet drawer (dipakai chat Akunio + reusable).
 * Lookup per kode aset. BigInt diserialkan ke string.
 */
export async function getFixedAssetSheetAction(code: string) {
  try {
    const ctx = await requireContext();
    const clean = code.trim().toUpperCase();
    if (!clean) return fail("Kode aset kosong.");
    const rows = await db
      .select()
      .from(fixedAssets)
      .where(and(eq(fixedAssets.orgId, ctx.orgId), eq(fixedAssets.code, clean)))
      .limit(1);
    const asset = rows[0];
    if (!asset) return fail(`Aset ${clean} tidak ditemukan.`);
    const detail = await getFixedAssetDetail(db, ctx.orgId, asset.id);
    const postedLines = (detail?.schedule ?? []).filter((l) => l.status === "POSTED");
    const accumulatedMinor = postedLines.reduce((a, l) => a + l.depreciationAmountMinor, 0n);
    return {
      ok: true,
      data: {
        id: asset.id,
        code: asset.code,
        name: asset.name,
        category: asset.category,
        status: asset.status,
        acquisitionDate: asset.acquisitionDate,
        acquisitionCostMinor: asset.acquisitionCostMinor.toString(),
        salvageValueMinor: asset.salvageValueMinor.toString(),
        usefulLifeMonths: asset.usefulLifeMonths,
        depreciationMethod: asset.depreciationMethod,
        accumulatedMinor: accumulatedMinor.toString(),
        bookValueMinor: (asset.acquisitionCostMinor - accumulatedMinor).toString(),
        postedPeriods: postedLines.length,
        totalPeriods: (detail?.schedule ?? []).length,
      },
    };
  } catch (err) {
    return fail(err);
  }
}
