import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { fiscalPeriods, accounts } from "@/server/db/schema/org";
import { eq, desc } from "drizzle-orm";
import { TutupBukuClient } from "./tutup-buku-client";

export default async function TutupBukuPage() {
  const ctx = await requireContext();

  const [periods, allAccounts] = await Promise.all([
    db
      .select()
      .from(fiscalPeriods)
      .where(eq(fiscalPeriods.orgId, ctx.orgId))
      .orderBy(desc(fiscalPeriods.name)),
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

  return (
    <TutupBukuClient
      initialPeriods={periods}
      accounts={allAccounts}
    />
  );
}
