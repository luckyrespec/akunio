"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
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
    await db.transaction(async (tx) => {
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
    const res = await db.transaction(async (tx) => {
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
    await db.transaction(async (tx) => {
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
    await db.transaction(async (tx) => {
      const period = await setPeriodStatus(tx, ctx.orgId, periodId, "OPEN");
      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "PERIOD_REOPEN",
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

export async function createPeriodAction(payload: {
  name: string;
  startsOn: string;
  endsOn: string;
}): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const { createPeriod } = await import("@/server/db/repos/periods.repo");
    await db.transaction(async (tx) => {
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
    await db.transaction(async (tx) => {
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

    // Check if period has any journal entries
    const existingEntry = await db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(eq(journalEntries.periodId, periodId))
      .limit(1);

    if (existingEntry.length > 0) {
      return {
        ok: false,
        error: "Periode tidak dapat dihapus karena sudah memiliki catatan jurnal transaksi.",
      };
    }

    await db.transaction(async (tx) => {
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
    const result = await evaluatePeriodReadiness(db, ctx.orgId, periodName);
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
  incomeSummaryAccountId?: string;
  retainedEarningsAccountId?: string;
}) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const { closePeriod } = await import(
      "@/server/db/repos/periods-closing.repo"
    );

    const result = await db.transaction(async (tx) => {
      const res = await closePeriod(tx, {
        orgId: ctx.orgId,
        periodName: payload.periodName,
        actorEmail: ctx.userEmail,
        isYearEnd: payload.isYearEnd,
        incomeSummaryAccountId: payload.incomeSummaryAccountId,
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
