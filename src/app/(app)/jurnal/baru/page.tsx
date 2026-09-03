import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listAccounts } from "@/server/db/repos/accounts.repo";
import { NewEntryForm } from "@/components/journal/new-entry-form";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";

export default async function JurnalBaruPage() {
  const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
  const rows = await db.transaction((tx) => listAccounts(tx, ctx.orgId));
  const leaves = rows.filter((a) => !rows.some((c) => c.parentCode === a.code));

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6">
      <div className="mb-2">
        <Link href="/jurnal" className="inline-flex items-center text-xs font-medium text-ink-soft hover:text-terra transition-colors">
          ← Kembali ke Jurnal Umum
        </Link>
      </div>

      <PageHeader
        title="Tulis Jurnal Baru"
        eyebrow="Pastikan jumlah total Debit dan Kredit seimbang sebelum memposting transaksi."
      />

      <NewEntryForm
        accounts={leaves.map((a) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          label: `${a.code} · ${a.name}`,
        }))}
      />
    </section>
  );
}
