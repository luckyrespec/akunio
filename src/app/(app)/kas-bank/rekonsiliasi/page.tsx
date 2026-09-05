import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listReconciliationsRepo } from "@/server/db/repos/reconciliation.repo";
import { accounts } from "@/server/db/schema/org";
import { ReconciliationDashboard } from "@/components/reconciliation/reconciliation-dashboard";
import { eq, and, or } from "drizzle-orm";

export default async function RekonsiliasiPage() {
  const ctx = await requireContext();

  const [sessions, bankAccounts] = await Promise.all([
    listReconciliationsRepo(db, ctx.orgId),
    db
      .select({ id: accounts.id, code: accounts.code, name: accounts.name })
      .from(accounts)
      .where(
        and(
          eq(accounts.orgId, ctx.orgId),
          or(eq(accounts.isBank, true), eq(accounts.isCash, true))
        )
      ),
  ]);

  return (
    <div className="space-y-6">
      <ReconciliationDashboard
        sessions={sessions}
        bankAccounts={bankAccounts}
      />
    </div>
  );
}
