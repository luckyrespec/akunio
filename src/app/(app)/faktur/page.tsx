import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listInvoicesRepo, getAgingReportRepo } from "@/server/db/repos/invoices.repo";
import { listContactsRepo } from "@/server/db/repos/contacts.repo";
import { accounts } from "@/server/db/schema/org";
import { InvoiceDashboard } from "@/components/invoicing/invoice-dashboard";
import { eq, and } from "drizzle-orm";

export default async function FakturPage() {
  const ctx = await requireContext();

  const [invoices, contacts, cashAccounts, aging] = await Promise.all([
    listInvoicesRepo(db, ctx.orgId),
    listContactsRepo(db, ctx.orgId),
    db
      .select({ id: accounts.id, code: accounts.code, name: accounts.name })
      .from(accounts)
      .where(and(eq(accounts.orgId, ctx.orgId), eq(accounts.isCash, true))),
    getAgingReportRepo(db, ctx.orgId, "INVOICE"),
  ]);

  return (
    <div className="space-y-6">
      <InvoiceDashboard
        invoices={invoices}
        contacts={contacts}
        accounts={cashAccounts}
        aging={aging}
      />
    </div>
  );
}
