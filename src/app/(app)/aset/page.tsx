import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { listFixedAssets } from "@/server/db/repos/assets.repo";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import { eq, and } from "drizzle-orm";
import { AsetClient } from "./aset-client";

export default async function AsetPage() {
  const ctx = await requireContext();

  // withOrg terpisah per query: satu pg client tak boleh query konkuren.
  const [assets, allAccounts, periods] = await Promise.all([
    withOrg(ctx.orgId, (tx) => listFixedAssets(tx, ctx.orgId)),
    withOrg(ctx.orgId, (tx) =>
      tx
        .select({
          id: accounts.id,
          code: accounts.code,
          name: accounts.name,
          type: accounts.type,
        })
        .from(accounts)
        .where(eq(accounts.orgId, ctx.orgId)),
    ),
    withOrg(ctx.orgId, (tx) =>
      tx
        .select({
          name: fiscalPeriods.name,
          status: fiscalPeriods.status,
        })
        .from(fiscalPeriods)
        .where(and(eq(fiscalPeriods.orgId, ctx.orgId), eq(fiscalPeriods.status, "OPEN")))
        .orderBy(fiscalPeriods.name),
    ),
  ]);

  return (
    <AsetClient
      initialAssets={assets}
      accounts={allAccounts}
      openPeriods={periods}
    />
  );
}
