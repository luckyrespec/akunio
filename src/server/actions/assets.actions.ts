"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { isRedirectError } from "./redirect-guard";
import { db } from "@/server/db";
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

    const asset = await db.transaction(async (tx) => {
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

    const result = await db.transaction(async (tx) => {
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
    const result = await db.transaction(async (tx) => {
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

    const result = await db.transaction(async (tx) => {
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
    return fail(err);
  }
}
