import { getInventoryOverviewAction } from "@/server/actions/inventory.actions";
import { PersediaanClient } from "./persediaan-client";

export const metadata = {
  title: "Barang & Jasa | Akunio",
  description: "Katalog barang, jasa, kartu stok, dan stok opname Akunio.",
};

function toJasaRow(i: {
  id: string;
  code: string;
  name: string;
  category: string | null;
  unit: string | null;
  standardSellingPriceMinor: bigint;
  isActive: boolean;
}) {
  return {
    id: i.id,
    code: i.code,
    name: i.name,
    category: i.category,
    unit: i.unit ?? "Sesi",
    priceMinor: i.standardSellingPriceMinor.toString(),
    isActive: i.isActive,
  };
}

export default async function PersediaanPage({
  searchParams,
}: {
  searchParams: Promise<{ jenis?: string }>;
}) {
  const sp = await searchParams;
  const jenis = sp.jenis === "jasa" ? "jasa" : sp.jenis === "barang" ? "barang" : "semua";
  const data = await getInventoryOverviewAction();
  return (
    <PersediaanClient
      initialData={data}
      initialJenis={jenis}
      jasaItems={data.jasaItems.map(toJasaRow)}
      archivedJasaItems={data.archivedJasaItems.map(toJasaRow)}
    />
  );
}
