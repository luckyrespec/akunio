import { getInventoryOverviewAction } from "@/server/actions/inventory.actions";
import { PersediaanClient } from "./persediaan-client";

export const metadata = {
  title: "Persediaan & Stok | Akunio",
  description: "Manajemen katalog barang, kartu stok, dan stok opname Akunio.",
};

export default async function PersediaanPage() {
  const data = await getInventoryOverviewAction();
  return <PersediaanClient initialData={data} />;
}
