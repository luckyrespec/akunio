import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { listInvoicesRepo, getAgingReportRepo } from "@/server/db/repos/invoices.repo";
import { listContactsRepo } from "@/server/db/repos/contacts.repo";
import { accounts } from "@/server/db/schema/org";
import { InvoiceDashboard } from "@/components/invoicing/invoice-dashboard";
import { eq, and } from "drizzle-orm";

export default async function FakturPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const tab = sp.tab === "utang" ? "UTANG" : sp.tab === "aging" ? "AGING" : "PIUTANG";

  const [invoices, contacts, cashAccounts, aging] = await withOrg(ctx.orgId, (tx) =>
    Promise.all([
      listInvoicesRepo(tx, ctx.orgId),
      listContactsRepo(tx, ctx.orgId),
      tx
        .select({ id: accounts.id, code: accounts.code, name: accounts.name })
        .from(accounts)
        .where(and(eq(accounts.orgId, ctx.orgId), eq(accounts.isCash, true))),
      getAgingReportRepo(tx, ctx.orgId, "INVOICE"),
    ]),
  );

  return (
    <div className="space-y-6">
      <InvoiceDashboard
        initialTab={tab}
        invoices={invoices}
        contacts={contacts}
        accounts={cashAccounts}
        aging={aging}
      />
    </div>
  );
}
