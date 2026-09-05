"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { withOrg } from "@/server/db/repos/with-org";
import { requireContext } from "@/server/auth/guard";
import { isRedirectError } from "./redirect-guard";
import { appendAudit } from "@/server/db/repos/audit.repo";
import { accounts as accountsTable } from "@/server/db/schema/org";
import { taxSummaries } from "@/server/db/schema/tax";
import { createDraft, getDraft } from "@/server/db/repos/drafts.repo";
import {
  saveTaxSettings,
  upsertMonthlyTaxSummary,
  settleTaxPayment,
} from "@/server/db/repos/tax.repo";
import type { TaxSettings } from "@/core/tax/pph-final";
import { Money } from "@/core/money/money";

export interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  draftId?: string;
  paymentEntryId?: string;
  message?: string;
  data?: T;
}

function fail(e: unknown): ActionResult {
  if (isRedirectError(e)) throw e;
  if (e instanceof Error) {
    if (e.message === "FORBIDDEN_AKSES") {
      return { ok: false, error: "Anda tidak memiliki izin untuk melakukan aksi ini." };
    }
    return { ok: false, error: e.message };
  }
  console.error(e);
  return { ok: false, error: "Terjadi kesalahan tak terduga." };
}

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {}
}

function getLastDayOfMonthISO(periodMonth: string): string {
  const [yearStr, monthStr] = periodMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  // Day 0 of next month is the last day of current month
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${periodMonth}-${String(lastDay).padStart(2, "0")}`;
}

const PERIOD_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function validateTaxSettingsPatch(settings: Partial<TaxSettings>): string | null {
  if (
    settings.taxpayerType !== undefined &&
    settings.taxpayerType !== "INDIVIDUAL" &&
    settings.taxpayerType !== "CORPORATE"
  ) {
    return "Jenis wajib pajak tidak valid (harus INDIVIDUAL atau CORPORATE).";
  }
  if (
    settings.ppnRatePercent !== undefined &&
    (!Number.isFinite(settings.ppnRatePercent) ||
      settings.ppnRatePercent < 0 ||
      settings.ppnRatePercent > 100)
  ) {
    return "Tarif PPN harus berupa angka 0–100.";
  }
  if (
    settings.taxPeriodYear !== undefined &&
    (!Number.isInteger(settings.taxPeriodYear) ||
      settings.taxPeriodYear < 2000 ||
      settings.taxPeriodYear > 2100)
  ) {
    return "Tahun pajak tidak valid.";
  }
  const booleanFlags = ["pphFinalEnabled", "autoMonthlyAccrual", "ppnEnabled", "withholdingTaxEnabled"] as const;
  for (const key of booleanFlags) {
    if (settings[key] !== undefined && typeof settings[key] !== "boolean") {
      return `Flag ${key} harus boolean.`;
    }
  }
  if (
    settings.npwp !== undefined &&
    (typeof settings.npwp !== "string" || settings.npwp.trim().length > 30)
  ) {
    return "NPWP tidak valid.";
  }
  return null;
}

export async function updateTaxSettingsAction(
  settings: Partial<TaxSettings>
): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);

    const settingsError = validateTaxSettingsPatch(settings);
    if (settingsError) return { ok: false, error: settingsError };

    await withOrg(ctx.orgId, async (tx) => {
      await saveTaxSettings(tx, ctx.orgId, settings);
      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "TAX_SETTINGS_UPDATE",
        subjectType: "tax_settings",
        subjectId: ctx.orgId,
        data: settings,
      });
    });

    safeRevalidate("/pengaturan");
    safeRevalidate("/pajak");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function generateTaxAccrualDraftAction(input: {
  periodMonth: string;
}): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const { periodMonth } = input;

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodMonth)) {
      return { ok: false, error: "Format periode bulan tidak valid (harus YYYY-MM)." };
    }

    return await withOrg(ctx.orgId, async (tx) => {
      // 1. Hitung ulang omzet dan pajak terutang
      const summary = await upsertMonthlyTaxSummary(tx, ctx.orgId, periodMonth);

      // Jika omzet di bawah batas fasilitas Rp 500jt atau tidak ada pajak
      if (summary.taxDueMinor === 0n) {
        await tx
          .update(taxSummaries)
          .set({ status: "ACCRUED", updatedAt: new Date() })
          .where(and(eq(taxSummaries.orgId, ctx.orgId), eq(taxSummaries.periodMonth, periodMonth)));

        safeRevalidate("/pajak");
        return {
          ok: true,
          message: "Peredaran bruto masih di dalam batas fasilitas Rp 500 juta. Beban pajak terutang Rp 0.",
        };
      }

      // 2. Periksa apakah draf yang ada masih PENDING
      if (summary.accrualDraftId) {
        const existingDraft = await getDraft(tx, ctx.orgId, summary.accrualDraftId);
        if (existingDraft && existingDraft.status === "PENDING") {
          return { ok: true, draftId: existingDraft.id };
        }
        // Draf lama sudah diterima/ditolak: jangan yatimkan tautannya dengan
        // draf baru bila akrual sudah diposting atau periode sudah lunas.
        if (summary.status === "PAID") {
          return { ok: false, error: "Periode ini sudah lunas. Koreksi dilakukan lewat jurnal pembalik." };
        }
        if (summary.accrualJournalEntryId) {
          return { ok: false, error: "Akrual periode ini sudah diposting. Koreksi dilakukan lewat jurnal pembalik." };
        }
        if (existingDraft && existingDraft.status === "ACCEPTED") {
          return { ok: false, error: "Draf akrual periode ini sudah diterima dan diposting. Koreksi dilakukan lewat jurnal pembalik." };
        }
      } else if (summary.status === "PAID") {
        return { ok: false, error: "Periode ini sudah lunas. Koreksi dilakukan lewat jurnal pembalik." };
      }

      // 3. Cari akun 5700 (Beban Pajak) dan 2300 (Utang PPh)
      const coaRows = await tx
        .select({ id: accountsTable.id, code: accountsTable.code, name: accountsTable.name })
        .from(accountsTable)
        .where(and(eq(accountsTable.orgId, ctx.orgId), inArray(accountsTable.code, ["5700", "2300"])));

      const bebanPajak = coaRows.find((a) => a.code === "5700");
      const utangPph = coaRows.find((a) => a.code === "2300");

      if (!bebanPajak || !utangPph) {
        return {
          ok: false,
          error: "Akun 5700 (Beban Pajak) atau 2300 (Utang PPh) tidak ditemukan pada bagan akun.",
        };
      }

      const dateISO = getLastDayOfMonthISO(periodMonth);
      const amountFormatted = Money.fromMinor(summary.taxDueMinor).formatIdr().replace("Rp", "").trim();

      const draftPayload = {
        dateISO,
        memo: `Akrual PPh Final PP 55/2022 Periode ${periodMonth}`,
        overallConfidence: 1,
        explanation: `Pengakuan beban pajak penghasilan final UMKM (tarif 0,5% PP No. 55/2022) periode ${periodMonth} sebesar ${Money.fromMinor(summary.taxDueMinor).formatIdr()}. Jurnal ini berupa draf dan harus ditinjau sebelum diposting.`,
        lines: [
          {
            accountCode: "5700",
            debitText: amountFormatted,
            creditText: "",
            confidence: 1,
            reason: "Beban Pajak Penghasilan Final UMKM (0,5%)",
          },
          {
            accountCode: "2300",
            debitText: "",
            creditText: amountFormatted,
            confidence: 1,
            reason: "Utang PPh Final PP 55/2022",
          },
        ],
        mapping: {
          lines: [
            { accountId: bebanPajak.id, matchedName: bebanPajak.name, unresolved: false },
            { accountId: utangPph.id, matchedName: utangPph.name, unresolved: false },
          ],
          warnings: [],
        },
      };

      // Buat draf di aiDrafts
      const draft = await createDraft(tx, {
        orgId: ctx.orgId,
        kind: "TEXT",
        inputText: `Perhitungan PPh Final PP 55/2022 Periode ${periodMonth}`,
        draft: draftPayload,
        model: "rule:pp-55-2022",
      });

      // Tautkan ke tax_summaries
      await tx
        .update(taxSummaries)
        .set({
          accrualDraftId: draft.id,
          status: "DRAFTED",
          updatedAt: new Date(),
        })
        .where(and(eq(taxSummaries.orgId, ctx.orgId), eq(taxSummaries.periodMonth, periodMonth)));

      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "TAX_ACCRUAL_DRAFT_GENERATE",
        subjectType: "tax_summary",
        subjectId: summary.id,
        data: {
          periodMonth,
          taxDueMinor: String(summary.taxDueMinor),
          draftId: draft.id,
        },
      });

      safeRevalidate("/pajak");
      safeRevalidate("/jurnal");
      return { ok: true, draftId: draft.id };
    });
  } catch (e) {
    return fail(e);
  }
}

export async function recordTaxPaymentAction(input: {
  periodMonth: string;
  ntpn: string;
  paidAtISO: string;
  bankAccountId: string;
}): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);

    if (!PERIOD_MONTH_RE.test(input.periodMonth)) {
      return { ok: false, error: "Format periode bulan tidak valid (harus YYYY-MM)." };
    }
    const ntpn = input.ntpn ? input.ntpn.trim() : "";
    if (!/^[A-Za-z0-9]{8,30}$/.test(ntpn)) {
      return { ok: false, error: "NTPN tidak valid (8–30 karakter alfanumerik tanpa spasi)." };
    }
    if (!input.paidAtISO) {
      return { ok: false, error: "Tanggal penyetoran wajib diisi." };
    }
    const paidTime = Date.parse(input.paidAtISO);
    if (Number.isNaN(paidTime)) {
      return { ok: false, error: "Tanggal penyetoran tidak valid." };
    }
    if (paidTime > Date.now()) {
      return { ok: false, error: "Tanggal penyetoran tidak boleh di masa depan." };
    }
    if (!input.bankAccountId) {
      return { ok: false, error: "Rekening asal penyetoran (Kas/Bank) wajib dipilih." };
    }

    const result = await withOrg(ctx.orgId, async (tx) => {
      const res = await settleTaxPayment(tx, ctx.orgId, {
        periodMonth: input.periodMonth,
        ntpn: input.ntpn.trim(),
        paidAtISO: input.paidAtISO,
        bankAccountId: input.bankAccountId,
        actorEmail: ctx.userEmail,
      });

      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "TAX_PAYMENT_SETTLE",
        subjectType: "tax_summary",
        subjectId: input.periodMonth,
        data: {
          periodMonth: input.periodMonth,
          ntpn: input.ntpn.trim(),
          paymentJournalEntryId: res.paymentEntryId,
        },
      });

      return res;
    });

    safeRevalidate("/pajak");
    safeRevalidate("/buku-besar");
    safeRevalidate("/laporan/calk");
    return { ok: true, paymentEntryId: result.paymentEntryId };
  } catch (e) {
    return fail(e);
  }
}
