import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listContactCards } from "@/server/db/repos/subsidiary.repo";
import { PageHeader } from "@/components/page-header";
import { Money } from "@/core/money/money";
import { ContactListTable } from "@/components/subsidiary/contact-ledger";

export default async function UtangListPage() {
  const ctx = await requireContext();
  const rows = await listContactCards(db, ctx.orgId, "BILL");
  const totalSisa = rows.reduce((a, r) => a + r.outstandingMinor, 0n);

  return (
    <div className="space-y-4">
      <Link href="/buku-pembantu" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink transition-colors">
        <ArrowLeft className="size-3.5" />
        <span>Kembali ke Buku Pembantu</span>
      </Link>
      <PageHeader
        title="Kartu Utang"
        eyebrow="Tagihan, pelunasan, dan sisa tiap pemasok"
      />
      <p className="text-xs text-ink-soft">
        {rows.length} pemasok · sisa terutang <strong className="font-mono text-ink tnum">{Money.formatIdr(totalSisa)}</strong>
      </p>
      <ContactListTable
        rows={rows}
        basePath="/buku-pembantu/utang"
        emptyHint="Belum ada tagihan pembelian aktif."
      />
    </div>
  );
}
