"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireContext } from "@/server/auth/guard";
import { intangibleAssets } from "@/server/db/schema/intangible";
import { isRedirectError } from "./redirect-guard";
import { withOrg } from "@/server/db/repos/with-org";
import {
  createIntangible,
  postMonthlyAmortization,
  disposeIntangible,
  type IntangibleCategory,
} from "@/server/db/repos/intangible-assets.repo";
import { postJournalEntry } from "@/server/db/repos/journals.repo";
import { buildAcquisitionJournal } from "@/core/assets/acquisition";
import {
  recommendIntangibleWithSak,
  type IntangibleSakRecommendation,
} from "@/server/ai/intangible-recommend";
import { Money } from "@/core/money/money";

export interface IntangibleActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

function fail<T = unknown>(e: unknown): IntangibleActionResult<T> {
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

export async function createIntangibleWithAcquisitionAction(payload: {
  name: string;
  category: IntangibleCategory;
  acquisitionDate: string;
  inServiceDate: string;
  acquisitionCostText: string;
  usefulLifeMonths: number;
  assetAccountId: string;
  accumulatedAccountId: string;
  amortizationExpenseAccountId: string;
  notes?: string;
  postAcquisition?: boolean;
  counterAccountId?: string;
  postedBy?: string;
}): Promise<IntangibleActionResult<{ id: string; code: string }>> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const costMinor = Money.parseIdr(payload.acquisitionCostText).minor;
    if (costMinor <= 0n) return { ok: false, error: "Harga perolehan harus lebih besar dari Rp 0." };
    if (!Number.isInteger(payload.usefulLifeMonths) || payload.usefulLifeMonths <= 0) {
      return { ok: false, error: "Masa manfaat harus lebih besar dari 0 bulan." };
    }

    const result = await withOrg(ctx.orgId, async (tx) => {
      const asset = await createIntangible(tx, {
        orgId: ctx.orgId,
        name: payload.name.trim(),
        category: payload.category,
        acquisitionDate: payload.acquisitionDate,
        inServiceDate: payload.inServiceDate,
        acquisitionCostMinor: costMinor,
        usefulLifeMonths: payload.usefulLifeMonths,
        assetAccountId: payload.assetAccountId,
        accumulatedAccountId: payload.accumulatedAccountId,
        amortizationExpenseAccountId: payload.amortizationExpenseAccountId,
        notes: payload.notes?.trim(),
      });

      if (payload.postAcquisition) {
        if (!payload.counterAccountId) throw new Error("AKUN_LAWAN_WAJIB");
        const je = buildAcquisitionJournal({
          assetId: asset.id,
          assetCode: asset.code,
          assetName: asset.name,
          assetAccountId: payload.assetAccountId,
          counterAccountId: payload.counterAccountId,
          acquisitionCostMinor: costMinor,
          acquisitionDate: payload.acquisitionDate,
        });
        const posted = await postJournalEntry(tx, ctx.orgId, payload.postedBy ?? ctx.userEmail, {
          dateISO: je.dateISO,
          memo: je.memo,
          source: je.source,
          idempotencyKey: je.idempotencyKey,
          lines: je.lines.map((l) => ({
            accountId: l.accountId,
            debitMinor: l.debitMinor,
            creditMinor: l.creditMinor,
          })),
        });
        await tx
          .update(intangibleAssets)
          .set({ acquisitionPosted: true })
          .where(and(eq(intangibleAssets.orgId, ctx.orgId), eq(intangibleAssets.id, asset.id)));
        return { asset, journalEntryId: posted.id };
      }

      return { asset, journalEntryId: null as string | null };
    });

    revalidatePath("/aset-takberwujud");
    return { ok: true, data: { id: result.asset.id, code: result.asset.code } };
  } catch (err) {
    return fail(err);
  }
}

export async function postIntangibleAmortizationAction(payload: {
  periodName: string;
}): Promise<IntangibleActionResult<{ postedCount: number; journalEntryId: string | null }>> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(payload.periodName)) {
      return { ok: false, error: "PERIODE_TIDAK_VALID: periodName wajib format YYYY-MM." };
    }
    const data = await withOrg(ctx.orgId, (tx) =>
      postMonthlyAmortization(tx, {
        orgId: ctx.orgId,
        periodName: payload.periodName,
        postedBy: ctx.userEmail,
      }),
    );
    revalidatePath("/aset-takberwujud");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function disposeIntangibleAction(payload: {
  assetId: string;
  disposalDate: string;
  disposalType: "SALE" | "SCRAP" | "WRITE_OFF";
  proceedsMinorText: string;
  depositAccountId?: string;
  gainLossAccountId: string;
  notes?: string;
}): Promise<IntangibleActionResult<{ journalEntryId: string }>> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.disposalDate)) {
      return { ok: false, error: "Tanggal pelepasan wajib format YYYY-MM-DD." };
    }
    if (!/^\d+$/.test(payload.proceedsMinorText)) {
      return { ok: false, error: "Nominal hasil wajib digit." };
    }
    const data = await withOrg(ctx.orgId, (tx) =>
      disposeIntangible(tx, {
        orgId: ctx.orgId,
        assetId: payload.assetId,
        disposalDate: payload.disposalDate,
        disposalType: payload.disposalType,
        proceedsMinor: BigInt(payload.proceedsMinorText || "0"),
        depositAccountId: payload.depositAccountId,
        gainLossAccountId: payload.gainLossAccountId,
        notes: payload.notes?.trim(),
        postedBy: ctx.userEmail,
      }),
    );
    revalidatePath("/aset-takberwujud");
    return { ok: true, data: { journalEntryId: data.journalEntryId } };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Rekomendasi kategori + masa manfaat via LLM (flash-lite) dengan konteks
 * RAG SAK EMKM Bab 12. Tanpa API key / AI_MOCK=1 → heuristik luring.
 */
export async function recommendIntangibleSakAction(payload: {
  name: string;
  category: string;
}): Promise<IntangibleActionResult<IntangibleSakRecommendation>> {
  try {
    await requireContext();
    const name = payload.name.trim();
    if (!name) return { ok: false, error: "Isi nama aset terlebih dahulu." };
    const data = await recommendIntangibleWithSak(name, payload.category);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}
