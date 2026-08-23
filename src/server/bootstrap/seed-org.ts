import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import { COA_TEMPLATE } from "@/core/accounts/coa-template";

const pad2 = (n: number): string => String(n).padStart(2, "0");

export async function seedOrgData(
  orgId: string,
  fiscalYearStartMonth = 1,
): Promise<void> {
  const existing = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.orgId, orgId))
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(accounts).values(
    COA_TEMPLATE.map((d) => ({
      orgId,
      code: d.code,
      name: d.name,
      type: d.type,
      normal: d.normal,
      parentCode: d.parentCode ?? null,
      isCash: d.isCash ?? false,
      isBank: d.isBank ?? false,
      contra: d.contra ?? false,
    })),
  );

  const startOffset = fiscalYearStartMonth - 1;
  const baseYear = new Date().getFullYear();
  const rows = Array.from({ length: 12 }, (_, i) => {
    const total = startOffset + i;
    const y = baseYear + Math.floor(total / 12);
    const m = (total % 12) + 1;
    const name = `${y}-${pad2(m)}`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
      orgId,
      name,
      startsOn: `${name}-01`,
      endsOn: `${name}-${pad2(lastDay)}`,
      status: "OPEN" as const,
    };
  });
  await db.insert(fiscalPeriods).values(rows);
}
