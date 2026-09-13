import { notFound } from "next/navigation";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import {
  getInventoryItem,
  listItemCostHistory,
  listItemTransactions,
} from "@/server/db/repos/inventory.repo";
import { ItemDetailClient, type ItemDetailTab } from "./item-detail-client";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

const TABS: ItemDetailTab[] = ["detail", "kartu-stok", "riwayat-harga"];

export default async function ItemDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const initialTab: ItemDetailTab =
    sp.tab && (TABS as string[]).includes(sp.tab) ? (sp.tab as ItemDetailTab) : "detail";
  const ctx = await requireContext();
  const item = await getInventoryItem(db, ctx.orgId, id);

  if (!item) notFound();

  const [transactions, costHistory] = await Promise.all([
    listItemTransactions(db, ctx.orgId, id),
    listItemCostHistory(db, ctx.orgId, id),
  ]);

  return (
    <ItemDetailClient
      item={{
        id: item.id,
        code: item.code,
        name: item.name,
        category: item.category,
        unit: item.unit ?? "Pcs",
        appBarcode: item.appBarcode,
        barcode: item.barcode,
        currentQty: item.currentQty,
        minStockAlert: item.minStockAlert ?? "0",
        averageCostMinor: item.averageCostMinor,
        totalCostMinor: item.totalCostMinor,
        standardSellingPriceMinor: item.standardSellingPriceMinor,
        isActive: item.isActive,
        imageStorageKey: item.imageStorageKey,
      }}
      transactions={transactions.map((tx) => ({
        id: tx.id,
        date: tx.date,
        type: tx.type,
        memo: tx.memo,
        qty: tx.qty,
        unitCostMinor: tx.unitCostMinor,
        totalCostMinor: tx.totalCostMinor,
        resultingQty: tx.resultingQty,
      }))}
      costHistory={costHistory}
      initialTab={initialTab}
    />
  );
}
