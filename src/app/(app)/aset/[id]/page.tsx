import { notFound } from "next/navigation";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getFixedAssetDetail } from "@/server/db/repos/assets.repo";
import { accounts } from "@/server/db/schema/org";
import { eq, and } from "drizzle-orm";
import { AssetDetailClient } from "./asset-detail-client";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();

  const [detail, allAccounts] = await Promise.all([
    getFixedAssetDetail(db, ctx.orgId, id),
    db
      .select({
        id: accounts.id,
        code: accounts.code,
        name: accounts.name,
        type: accounts.type,
      })
      .from(accounts)
      .where(eq(accounts.orgId, ctx.orgId)),
  ]);

  if (!detail) {
    notFound();
  }

  return (
    <AssetDetailClient
      asset={detail.asset}
      schedule={detail.schedule}
      disposal={detail.disposal}
      accounts={allAccounts}
    />
  );
}
