import { notFound } from "next/navigation";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
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
  const { item, accRows } = await withOrg(ctx.orgId, async (tx) => {
    const item = await getInventoryItem(tx, ctx.orgId, id);
    if (!item || item.itemType !== "JASA") return { item: null, accRows: [] };
    const accRows = await tx
      .select({ id: accounts.id, code: accounts.code, name: accounts.name, type: accounts.type })
      .from(accounts)
      .where(and(eq(accounts.orgId, ctx.orgId)));
    return { item, accRows };
  });

  if (!item || item.itemType !== "JASA") notFound();

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
