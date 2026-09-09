"use server";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { createPrepaidContract, postMonthlyAmortization } from "@/server/db/repos/prepaid.repo";

export async function createPrepaidContractAction(input: {
  name: string; vendor?: string; startDate: string; months: number;
  totalMinor: string; controlAccountId: string; expenseAccountId: string; paymentAccountId: string;
}) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const res = await withOrg(ctx.orgId, (tx) => createPrepaidContract(tx, {
      orgId: ctx.orgId, ...input, months: Number(input.months),
      totalMinor: BigInt(input.totalMinor), postedBy: ctx.userEmail,
    }));
    return { ok: true as const, contractId: res.contract.id, code: res.contract.code };
  } catch (err: unknown) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Gagal menyimpan kontrak" };
  }
}

export async function postAmortizationAction(input: { periodName: string; contractId?: string }) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const res = await withOrg(ctx.orgId, (tx) => postMonthlyAmortization(tx, {
      orgId: ctx.orgId, periodName: input.periodName, postedBy: ctx.userEmail, contractId: input.contractId,
    }));
    return { ok: true as const, postedCount: res.postedCount };
  } catch (err: unknown) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Gagal memposting amortisasi" };
  }
}
