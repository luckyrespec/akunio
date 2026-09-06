import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listInventoryItems } from "@/server/db/repos/inventory.repo";
import { PageHeader } from "@/components/page-header";
import { OpnameFormClient } from "./opname-form-client";

export const metadata = {
  title: "Mulai Stok Opname | Akunio",
  description: "Pencatatan hitung fisik stok gudang dan penyesuaian selisih buku.",
};

export default async function NewStockOpnamePage() {
  const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
  const allItems = await listInventoryItems(db, ctx.orgId);
  const items = allItems.filter((i) => i.itemType !== "JASA");

  return (
    <section className="w-full space-y-6">
      <div className="mb-2">
        <Link
          href="/persediaan/opname"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-terra transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Kembali ke Daftar Opname
        </Link>
      </div>

      <OpnameFormClient
        items={items.map((i) => ({
          id: i.id,
          code: i.code,
          name: i.name,
          unit: i.unit,
          currentQty: i.currentQty,
          averageCostMinor: i.averageCostMinor,
        }))}
      />
    </section>
  );
}
