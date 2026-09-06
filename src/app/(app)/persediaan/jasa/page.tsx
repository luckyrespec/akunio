import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listServiceItems } from "@/server/db/repos/inventory.repo";
import { JasaClient } from "./jasa-client";

export const metadata = {
  title: "Jasa & Layanan | Akunio",
  description: "Katalog jasa dan layanan untuk dipadukan dengan barang dalam satu faktur.",
};

export default async function JasaPage() {
  const ctx = await requireContext();
  const items = await listServiceItems(db, ctx.orgId);

  return (
    <section className="w-full space-y-6">
      <PageHeader
        title="Jasa & Layanan"
        eyebrow="Katalog jasa untuk dipadukan dengan barang dalam satu faktur."
        actions={
          <Link href="/persediaan/jasa/baru">
            <Button
              data-testid="persediaan-jasa-tambah"
              className="h-9 rounded-xl bg-terra px-4 text-xs font-semibold text-white shadow-2xs transition-[transform,background-color] hover:bg-terra/90 active:scale-[0.98]"
            >
              <Plus className="mr-1.5 size-3.5" />
              Tambah Jasa
            </Button>
          </Link>
        }
      />
      <JasaClient
        items={items.map((i) => ({
          id: i.id,
          code: i.code,
          name: i.name,
          category: i.category,
          unit: i.unit,
          priceMinor: i.standardSellingPriceMinor.toString(),
          isActive: i.isActive,
        }))}
      />
    </section>
  );
}
