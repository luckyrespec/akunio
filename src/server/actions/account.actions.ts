"use server";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { appendAudit } from "@/server/db/repos/audit.repo";
import { getAccountById, setAccountArchived } from "@/server/db/repos/accounts.repo";

export async function archiveAccountAction(accountId: string, archive: boolean) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    await db.transaction(async (tx) => {
      const existing = await getAccountById(tx, ctx.orgId, accountId);
      if (!existing) throw new Error("AKUN_TIDAK_DITEMUKAN");
      const row = await setAccountArchived(tx, ctx.orgId, accountId, archive ? new Date() : null);
      await appendAudit(tx, {
        orgId: ctx.orgId, actor: ctx.userEmail,
        action: archive ? "ACCOUNT_ARCHIVE" : "ACCOUNT_RESTORE",
        subjectType: "account", subjectId: accountId,
        data: { code: row.code },
      });
    });
    revalidatePath("/pengaturan");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "GAGAL" };
  }
}
