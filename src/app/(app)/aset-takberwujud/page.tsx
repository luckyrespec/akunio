import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { listIntangibleCards } from "@/server/db/repos/intangible-assets.repo";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { IntangibleListClient } from "./list-client";

export default async function IntangibleListPage() {
  const ctx = await requireContext();
  const rows = await withOrg(ctx.orgId, (tx) => listIntangibleCards(tx, ctx.orgId));

  return (
    <div className="space-y-4">
      <Link href="/dasbor" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink transition-colors">
        <ArrowLeft className="size-3.5" />
        <span>Kembali ke Dasbor</span>
      </Link>
      <PageHeader
        title="Aset Takberwujud"
        eyebrow="Lisensi, merek, dan amortisasi sesuai SAK EMKM Bab 12"
        actions={
          <Link href="/aset-takberwujud/baru">
            <Button className="bg-terra text-white hover:bg-terra/90 text-xs h-9 rounded-xl shadow-2xs">
              <Plus data-icon="inline-start" />
              Tambah Aset Takberwujud
            </Button>
          </Link>
        }
      />
      <IntangibleListClient rows={rows} />
    </div>
  );
}
