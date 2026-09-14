"use server";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { reconcileSubledger, reportSubledgerMismatch } from "@/server/db/repos/subledger.repo";

export async function getSubledgerReconAction() {
  const ctx = await requireContext();
  const rows = await withOrg(ctx.orgId, (tx) => reconcileSubledger(tx, ctx.orgId));
  return rows.map((r) => ({
    kind: r.kind,
    controlAccountId: r.controlAccountId,
    controlBalanceMinor: r.controlBalanceMinor.toString(),
    subledgerTotalMinor: r.subledgerTotalMinor.toString(),
    differenceMinor: r.differenceMinor.toString(),
  }));
}

export async function runSubledgerCheckAction() {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const res = await withOrg(ctx.orgId, async (tx) => {
      const rows = await reconcileSubledger(tx, ctx.orgId);
      const findings = await reportSubledgerMismatch(tx, ctx.orgId, rows);
      return { rows, findings };
    });
    return {
      ok: true as const,
      findings: res.findings,
      rows: res.rows.map((r) => ({ ...r, controlBalanceMinor: r.controlBalanceMinor.toString(), subledgerTotalMinor: r.subledgerTotalMinor.toString(), differenceMinor: r.differenceMinor.toString() })),
    };
  } catch (err: unknown) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Gagal menjalankan rekonsiliasi" };
  }
}
