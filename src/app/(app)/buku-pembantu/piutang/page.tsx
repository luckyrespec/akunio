import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listContactCards } from "@/server/db/repos/subsidiary.repo";
import { PageHeader } from "@/components/page-header";
import { ContactListTable } from "@/components/subsidiary/contact-ledger";

export default async function PiutangListPage() {
  const ctx = await requireContext();
  const rows = await listContactCards(db, ctx.orgId, "INVOICE");

  return (
    <div className="space-y-4">
      <Link href="/buku-pembantu" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink transition-colors">
        <ArrowLeft className="size-3.5" />
        <span>Kembali ke Buku Pembantu</span>
      </Link>
      <PageHeader
        title="Kartu Piutang"
        eyebrow="Tagihan, pembayaran, dan sisa tiap pelanggan"
      />
      <ContactListTable
        rows={rows}
        basePath="/buku-pembantu/piutang"
        emptyHint="Belum ada faktur penjualan aktif."
      />
    </div>
  );
}
