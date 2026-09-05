import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listAccounts } from "@/server/db/repos/accounts.repo";
import { NewEntryForm } from "@/components/journal/new-entry-form";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function JurnalBaruPage() {
  const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
  const rows = await db.transaction((tx) => listAccounts(tx, ctx.orgId));
  const leaves = rows.filter((a) => !rows.some((c) => c.parentCode === a.code));

  return (
    <section className="w-full space-y-6">
      <div className="mb-2">
        <Link href="/jurnal" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-terra transition-colors">
          <ArrowLeft className="size-3.5" />
          Kembali ke Jurnal Umum
        </Link>
      </div>

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
