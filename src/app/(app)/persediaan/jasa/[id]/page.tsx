import { notFound } from "next/navigation";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getInventoryItem } from "@/server/db/repos/inventory.repo";
import { accounts } from "@/server/db/schema/org";
import { eq, and } from "drizzle-orm";
import { JasaDetailClient } from "./jasa-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function JasaDetailPage({ params }: Props) {
  const { id } = await params;
  const ctx = await requireContext();
  const item = await getInventoryItem(db, ctx.orgId, id);

  if (!item || item.itemType !== "JASA") notFound();

  const accRows = await db
    .select({ id: accounts.id, code: accounts.code, name: accounts.name, type: accounts.type })
    .from(accounts)
    .where(and(eq(accounts.orgId, ctx.orgId)));

  return (
    <JasaDetailClient
      item={{
        id: item.id,
        code: item.code,
        name: item.name,
        category: item.category,
        unit: item.unit ?? "Sesi",
        standardSellingPriceMinor: item.standardSellingPriceMinor,
        revenueAccountId: item.revenueAccountId,
        expenseAccountId: item.expenseAccountId,
        isActive: item.isActive,
        imageStorageKey: item.imageStorageKey,
      }}
      accounts={accRows}
    />
  );
}
