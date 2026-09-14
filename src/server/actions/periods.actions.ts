"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { withOrg } from "@/server/db/repos/with-org";
import { requireContext } from "@/server/auth/guard";
import { isRedirectError } from "./redirect-guard";
import { setPeriodStatus } from "@/server/db/repos/periods.repo";
import { appendAudit } from "@/server/db/repos/audit.repo";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function dismissYearEndPromptAction(periodName: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    if (!/^\d{4}-12$/.test(periodName)) throw new Error("PERIODE_TIDAK_VALID: format YYYY-12");
    const { organizations } = await import("@/server/db/schema/org");
    await withOrg(ctx.orgId, async (tx) => {
      const [org] = await tx
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, ctx.orgId))
        .limit(1);
      const cur = (org?.settings ?? {}) as Record<string, unknown>;
      await tx
        .update(organizations)
        .set({ settings: { ...cur, dismissedYearEnd: periodName } })
        .where(eq(organizations.id, ctx.orgId));
    });
    revalidatePath("/dasbor");
    return { ok: true };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "GAGAL_SIMPAN_PILIHAN" };
  }
}

export async function ensureYearPeriodsAction(
  year: number,
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const { ensureFiscalYearPeriods } = await import("@/server/db/repos/periods.repo");
    const res = await withOrg(ctx.orgId, async (tx) => {
      const out = await ensureFiscalYearPeriods(tx, ctx.orgId, year);
      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "PERIOD_CREATE_YEAR",
        subjectType: "fiscal_period",
        subjectId: `${out.year}`,
        data: { year: out.year, created: out.created },
      });
      return out;
    });
    revalidatePath("/pengaturan");
    revalidatePath("/tutup-buku");
    return { ok: true, created: res.created };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "GAGAL_TAMBAH_TAHUN" };
  }
}

export async function closePeriodAction(periodId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    await withOrg(ctx.orgId, async (tx) => {
      const period = await setPeriodStatus(tx, ctx.orgId, periodId, "CLOSED");
      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "PERIOD_CLOSE",
        subjectType: "fiscal_period",
        subjectId: periodId,
        data: { name: period.name },
      });
    });
    revalidatePath("/pengaturan");
    revalidatePath("/tutup-buku");
    return { ok: true };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "GAGAL" };
  }
}

export async function reopenPeriodAction(periodId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER"]); // reopening is owner-only per spec
    await withOrg(ctx.orgId, async (tx) => {
      const { fiscalPeriods } = await import("@/server/db/schema/org");
      const [period] = await tx
        .select()
        .from(fiscalPeriods)
        .where(and(eq(fiscalPeriods.orgId, ctx.orgId), eq(fiscalPeriods.id, periodId)))
        .limit(1);
      if (!period) throw new Error("PERIODE_TIDAK_DITEMUKAN");

      // Desember yang sudah tutup tahun tidak boleh dibuka kembali selama
      // jurnal penutupnya masih aktif — buka kuncinya dengan mereversal
      // jurnal penutup dulu (agar L/R tak hidup lagi diam-diam).
      if (period.name.endsWith("-12")) {
        const { journalEntries } = await import("@/server/db/schema/journal");
        const { findReversalEntries } = await import("@/server/db/repos/journals.repo");
        const year = period.name.slice(0, 4);
        const [closing] = await tx
          .select({ id: journalEntries.id })
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.orgId, ctx.orgId),
              eq(journalEntries.periodId, period.id),
              eq(journalEntries.idempotencyKey, `closing-${ctx.orgId}-${year}`),
              eq(journalEntries.status, "POSTED"),
            ),
          )
          .limit(1);
        if (closing) {
          const reversals = await findReversalEntries(tx, ctx.orgId, closing.id);
          if (reversals.length === 0) {
            throw new Error(
              "TUTUP_BUKU_BELUM_REVERSAL: reversal jurnal penutup akhir tahun dulu sebelum membuka kembali Desember",
            );
          }
        }
      }

      const reopened = await setPeriodStatus(tx, ctx.orgId, periodId, "OPEN");
      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "PERIOD_REOPEN",
        subjectType: "fiscal_period",
        subjectId: periodId,
        data: { name: reopened.name },
      });
    });
    revalidatePath("/pengaturan");
    revalidatePath("/tutup-buku");
    return { ok: true };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "GAGAL" };
  }
}

export async function createPeriodAction(payload: {
  name: string;
  startsOn: string;
  endsOn: string;
}): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const { createPeriod } = await import("@/server/db/repos/periods.repo");
    await withOrg(ctx.orgId, async (tx) => {
      const period = await createPeriod(tx, ctx.orgId, {
        name: payload.name.trim(),
        startsOn: payload.startsOn,
        endsOn: payload.endsOn,
        status: "OPEN",
      });
      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "PERIOD_CREATE",
        subjectType: "fiscal_period",
        subjectId: period.id,
        data: { name: period.name, startsOn: period.startsOn, endsOn: period.endsOn },
      });
    });
    revalidatePath("/pengaturan");
    revalidatePath("/tutup-buku");
    return { ok: true };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "GAGAL_TAMBAH_PERIODE" };
  }
}

export async function updatePeriodAction(
  periodId: string,
  payload: { name?: string; startsOn?: string; endsOn?: string },
): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const { updatePeriod } = await import("@/server/db/repos/periods.repo");
    await withOrg(ctx.orgId, async (tx) => {
      const period = await updatePeriod(tx, ctx.orgId, periodId, payload);
      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "PERIOD_UPDATE",
        subjectType: "fiscal_period",
        subjectId: period.id,
        data: { name: period.name, startsOn: period.startsOn, endsOn: period.endsOn },
      });
    });
    revalidatePath("/pengaturan");
    revalidatePath("/tutup-buku");
    return { ok: true };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "GAGAL_UPDATE_PERIODE" };
  }
}

export async function deletePeriodAction(periodId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER"]);
    const { deletePeriod } = await import("@/server/db/repos/periods.repo");
    const { journalEntries } = await import("@/server/db/schema/journal");
    const { eq } = await import("drizzle-orm");

    // Check if period has any journal entries (scoped ke org peminta).
    const existingEntry = await withOrg(ctx.orgId, (tx) =>
      tx
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(and(eq(journalEntries.orgId, ctx.orgId), eq(journalEntries.periodId, periodId)))
        .limit(1),
    );

    if (existingEntry.length > 0) {
      return {
        ok: false,
        error: "Periode tidak dapat dihapus karena sudah memiliki catatan jurnal transaksi.",
      };
    }

    await withOrg(ctx.orgId, async (tx) => {
      const period = await deletePeriod(tx, ctx.orgId, periodId);
      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "PERIOD_DELETE",
        subjectType: "fiscal_period",
        subjectId: periodId,
        data: { name: period.name },
      });
    });
    revalidatePath("/pengaturan");
    revalidatePath("/tutup-buku");
    return { ok: true };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "GAGAL_HAPUS_PERIODE" };
  }
}

export async function evaluatePeriodReadinessAction(periodName: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const { evaluatePeriodReadiness } = await import(
      "@/server/db/repos/periods-closing.repo"
    );
    const result = await withOrg(ctx.orgId, (tx) => evaluatePeriodReadiness(tx, ctx.orgId, periodName));
    return { ok: true, data: result };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return {
      ok: false,
      error: e instanceof Error ? e.message : "GAGAL_EVALUASI_PERIODE",
    };
  }
}

export async function executePeriodCloseAction(payload: {
  periodName: string;
  isYearEnd?: boolean;
  retainedEarningsAccountId?: string;
}) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const { closePeriod } = await import(
      "@/server/db/repos/periods-closing.repo"
    );

    const result = await withOrg(ctx.orgId, async (tx) => {
      const res = await closePeriod(tx, {
        orgId: ctx.orgId,
        periodName: payload.periodName,
        actorEmail: ctx.userEmail,
        isYearEnd: payload.isYearEnd,
        retainedEarningsAccountId: payload.retainedEarningsAccountId,
      });

      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "PERIOD_CLOSE",
        subjectType: "fiscal_period",
        subjectId: res.period.id,
        data: {
          name: res.period.name,
          closingJournalId: res.closingJournalId,
          isYearEnd: payload.isYearEnd,
        },
      });

      return res;
    });

    revalidatePath("/pengaturan");
    revalidatePath("/tutup-buku");
    revalidatePath("/jurnal");
    return { ok: true, data: result };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return {
      ok: false,
      error: e instanceof Error ? e.message : "GAGAL_TUTUP_PERIODE",
    };
  }
}
