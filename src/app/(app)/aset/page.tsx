import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listFixedAssets } from "@/server/db/repos/assets.repo";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import { eq, and } from "drizzle-orm";
import { AsetClient } from "./aset-client";

export default async function AsetPage() {
  const ctx = await requireContext();

  const [assets, allAccounts, periods] = await Promise.all([
    listFixedAssets(db, ctx.orgId),
    db
      .select({
        id: accounts.id,
        code: accounts.code,
        name: accounts.name,
        type: accounts.type,
      })
      .from(accounts)
      .where(eq(accounts.orgId, ctx.orgId)),
    db
      .select({
        name: fiscalPeriods.name,
        status: fiscalPeriods.status,
      })
      .from(fiscalPeriods)
      .where(and(eq(fiscalPeriods.orgId, ctx.orgId), eq(fiscalPeriods.status, "OPEN")))
      .orderBy(fiscalPeriods.name),
  ]);

  return (
    <AsetClient
      initialAssets={assets}
      accounts={allAccounts}
      openPeriods={periods}
    />
  );
}
