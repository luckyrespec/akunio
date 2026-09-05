import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listCashEntriesRepo } from "@/server/db/repos/cash-bank.repo";
import { listContactsRepo } from "@/server/db/repos/contacts.repo";
import { accounts } from "@/server/db/schema/org";
import { CashEntriesTable } from "@/components/kas-bank/cash-entries-table";
import {
  CashEntryDialog,
  type QuickPick,
} from "@/components/kas-bank/cash-entry-dialog";
import { eq } from "drizzle-orm";

const QUICK_BAYAR: Array<{ code: string; label: string }> = [
  { code: "5900", label: "Beban Lain" },
  { code: "5200", label: "Gaji" },
  { code: "2100", label: "Bayar Utang" },
  { code: "3300", label: "Prive" },
];

export default async function PembayaranPage() {
  const ctx = await requireContext();
  const [entries, allAccounts, contacts] = await Promise.all([
    listCashEntriesRepo(db, ctx.orgId, "BAYAR"),
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
    listContactsRepo(db, ctx.orgId),
  ]);

  const parentCodes = new Set(
    allAccounts.map((a) => a.parentCode).filter((c): c is string => !!c)
  );
  const leaf = allAccounts.filter((a) => !parentCodes.has(a.code));
  const cashAccounts = leaf.filter((a) => a.isCash);
  const quickPicks: QuickPick[] = QUICK_BAYAR.flatMap((q) => {
    const hit = leaf.find((a) => a.code === q.code);
    return hit ? [{ accountId: hit.id, label: q.label }] : [];
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">
            Pembayaran
          </h1>
          <p className="text-sm text-ink-soft">
            Catat pengeluaran kas/bank — otomatis menjadi jurnal.
          </p>
        </div>
        <CashEntryDialog
          kind="BAYAR"
          title="Catat Pembayaran"
          triggerLabel="Tambah Pembayaran"
          cashAccounts={cashAccounts}
          counterAccounts={leaf}
          contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
          quickPicks={quickPicks}
        />
      </div>
      <CashEntriesTable entries={entries} />
    </div>
  );
}
