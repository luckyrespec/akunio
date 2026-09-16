import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { listReconciliationsRepo } from "@/server/db/repos/reconciliation.repo";
import { accounts } from "@/server/db/schema/org";
import { ReconciliationDashboard } from "@/components/reconciliation/reconciliation-dashboard";
import { Reveal } from "@/components/motion";
import { eq, and, or } from "drizzle-orm";

export default async function RekonsiliasiPage() {
  const ctx = await requireContext();

  // withOrg terpisah per query: satu pg client tak boleh query konkuren.
  const [sessions, bankAccounts] = await Promise.all([
    withOrg(ctx.orgId, (tx) => listReconciliationsRepo(tx, ctx.orgId)),
    withOrg(ctx.orgId, (tx) =>
      tx
        .select({ id: accounts.id, code: accounts.code, name: accounts.name })
        .from(accounts)
        .where(
          and(
            eq(accounts.orgId, ctx.orgId),
            or(eq(accounts.isBank, true), eq(accounts.isCash, true))
          )
        ),
    ),
  ]);

  return (
    <div className="space-y-6">
      <Reveal>
      <ReconciliationDashboard
        sessions={sessions}
        bankAccounts={bankAccounts}
      />
      </Reveal>
    </div>
  );
}
