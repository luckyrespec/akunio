import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listInventoryItems } from "@/server/db/repos/inventory.repo";
import { OpnameFormClient } from "./opname-form-client";

export const metadata = {
  title: "Input Hitung Fisik Opname | Akunio",
};

export default async function NewStockOpnamePage() {
  const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
  const items = await listInventoryItems(db, ctx.orgId);

  return (
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
  );
}
