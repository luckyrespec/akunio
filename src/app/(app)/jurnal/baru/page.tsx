import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listAccounts } from "@/server/db/repos/accounts.repo";
import { NewEntryForm } from "@/components/journal/new-entry-form";

export default async function JurnalBaruPage() {
  const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
  const rows = await db.transaction((tx) => listAccounts(tx, ctx.orgId));
  const leaves = rows.filter((a) => !rows.some((c) => c.parentCode === a.code));

  return (
    <section className="max-w-3xl">
      <h1 className="font-display text-2xl">Tulis Jurnal</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Debit dan kredit harus seimbang sebelum jurnal dapat diposting.
      </p>
      <NewEntryForm
        accounts={leaves.map((a) => ({ id: a.id, label: `${a.code} · ${a.name}` }))}
      />
    </section>
  );
}
