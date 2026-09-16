import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { listIntangibleCards } from "@/server/db/repos/intangible-assets.repo";
import { fiscalPeriods } from "@/server/db/schema/org";
import { IntangibleListClient } from "./list-client";
import { and, eq } from "drizzle-orm";

export default async function IntangibleListPage() {
  const ctx = await requireContext();

  // withOrg terpisah per query: satu pg client tak boleh query konkuren.
  const [rows, periods] = await Promise.all([
    withOrg(ctx.orgId, (tx) => listIntangibleCards(tx, ctx.orgId)),
    withOrg(ctx.orgId, (tx) =>
      tx
        .select({ name: fiscalPeriods.name, status: fiscalPeriods.status })
        .from(fiscalPeriods)
        .where(and(eq(fiscalPeriods.orgId, ctx.orgId), eq(fiscalPeriods.status, "OPEN")))
        .orderBy(fiscalPeriods.name),
    ),
  ]);

  return <IntangibleListClient rows={rows} openPeriods={periods} />;
}
