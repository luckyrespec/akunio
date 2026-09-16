import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { listInvoicesRepo, getAgingReportRepo } from "@/server/db/repos/invoices.repo";
import { listContactsRepo } from "@/server/db/repos/contacts.repo";
import { accounts } from "@/server/db/schema/org";
import { InvoiceDashboard } from "@/components/invoicing/invoice-dashboard";
import { Reveal } from "@/components/motion";
import { eq, and } from "drizzle-orm";

export default async function FakturPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const tab = sp.tab === "utang" ? "UTANG" : sp.tab === "aging" ? "AGING" : "PIUTANG";

  // withOrg terpisah per query: satu pg client tak boleh query konkuren.
  const [invoices, contacts, cashAccounts, aging] = await Promise.all([
    withOrg(ctx.orgId, (tx) => listInvoicesRepo(tx, ctx.orgId)),
    withOrg(ctx.orgId, (tx) => listContactsRepo(tx, ctx.orgId)),
    withOrg(ctx.orgId, (tx) =>
      tx
        .select({ id: accounts.id, code: accounts.code, name: accounts.name })
        .from(accounts)
        .where(and(eq(accounts.orgId, ctx.orgId), eq(accounts.isCash, true))),
    ),
    withOrg(ctx.orgId, (tx) => getAgingReportRepo(tx, ctx.orgId, "INVOICE")),
  ]);

  return (
    <div className="space-y-6">
      <Reveal>
      <InvoiceDashboard
        initialTab={tab}
        invoices={invoices}
        contacts={contacts}
        accounts={cashAccounts}
        aging={aging}
      />
      </Reveal>
    </div>
  );
}
