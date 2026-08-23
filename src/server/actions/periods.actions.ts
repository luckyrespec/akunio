"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireContext } from "@/server/auth/guard";
import { setPeriodStatus } from "@/server/db/repos/periods.repo";
import { appendAudit } from "@/server/db/repos/audit.repo";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function closePeriodAction(periodId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    await db.transaction(async (tx) => {
      const period = await setPeriodStatus(tx, ctx.orgId, periodId, "CLOSED");
      await appendAudit(tx, {
        orgId: ctx.orgId, actor: ctx.userEmail, action: "PERIOD_CLOSE",
        subjectType: "fiscal_period", subjectId: periodId, data: { name: period.name },
      });
    });
    revalidatePath("/pengaturan");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "GAGAL" };
  }
}

export async function reopenPeriodAction(periodId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER"]); // reopening is owner-only per spec
    await db.transaction(async (tx) => {
      const period = await setPeriodStatus(tx, ctx.orgId, periodId, "OPEN");
      await appendAudit(tx, {
        orgId: ctx.orgId, actor: ctx.userEmail, action: "PERIOD_REOPEN",
        subjectType: "fiscal_period", subjectId: periodId, data: { name: period.name },
      });
    });
    revalidatePath("/pengaturan");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "GAGAL" };
  }
}
