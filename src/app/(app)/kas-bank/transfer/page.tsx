import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listCashEntriesRepo } from "@/server/db/repos/cash-bank.repo";
import { accounts } from "@/server/db/schema/org";
import { CashEntriesTable } from "@/components/kas-bank/cash-entries-table";
import { CashEntryDialog } from "@/components/kas-bank/cash-entry-dialog";
import { eq } from "drizzle-orm";

export default async function TransferPage() {
  const ctx = await requireContext();
  const [entries, allAccounts] = await Promise.all([
    listCashEntriesRepo(db, ctx.orgId, "TRANSFER"),
    db
      .select({
        id: accounts.id,
        code: accounts.code,
        name: accounts.name,
        parentCode: accounts.parentCode,
        isCash: accounts.isCash,
      })
      .from(accounts)
      .where(eq(accounts.orgId, ctx.orgId)),
  ]);

  const parentCodes = new Set(
    allAccounts.map((a) => a.parentCode).filter((c): c is string => !!c)
  );
  const leaf = allAccounts.filter((a) => !parentCodes.has(a.code));
  const cashAccounts = leaf.filter((a) => a.isCash);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">
            Transfer Bank
          </h1>
          <p className="text-sm text-ink-soft">
            Pindahkan dana antar akun kas/bank — otomatis menjadi jurnal.
          </p>
        </div>
        <CashEntryDialog
          kind="TRANSFER"
          title="Catat Transfer"
          triggerLabel="Tambah Transfer"
          cashAccounts={cashAccounts}
          counterAccounts={cashAccounts}
          contacts={[]}
          quickPicks={[]}
          transferMode
        />
      </div>
      <CashEntriesTable entries={entries} />
    </div>
  );
}
