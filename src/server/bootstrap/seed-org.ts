import { eq } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { db } from "@/server/db";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import { subledgerControls } from "@/server/db/schema/subledger";
import type { AccountDef } from "@/core/accounts/types";
import { COA_TEMPLATE } from "@/core/accounts/coa-template";

type Executor = PgDatabase<
  NodePgQueryResultHKT,
  Record<string, never>,
  ExtractTablesWithRelations<Record<string, never>>
>;

const pad2 = (n: number): string => String(n).padStart(2, "0");

export async function seedOrgAccounts(
  orgId: string,
  defs: readonly AccountDef[],
  exec: Executor = db,
): Promise<void> {
  await exec.insert(accounts).values(
    defs.map((d) => ({
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
}

export async function seedFiscalPeriods(
  orgId: string,
  fiscalYearStartMonth = 1,
  exec: Executor = db,
): Promise<void> {
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
  await exec.insert(fiscalPeriods).values(rows);
}

export async function seedOrgData(
  orgId: string,
  fiscalYearStartMonth = 1,
  exec: Executor = db,
): Promise<void> {
  const existing = await exec
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.orgId, orgId))
    .limit(1);
  if (existing.length > 0) return;

  await seedOrgAccounts(orgId, COA_TEMPLATE, exec);
  await seedFiscalPeriods(orgId, fiscalYearStartMonth, exec);
  await seedPersediaanControl(orgId, exec);
}

/**
 * Daftarkan kontrol PERSEDIAAN agar alur modul (opname, pembelian) langsung
 * bisa posting tanpa menunggu onboarding selesai. Idempoten; dilewati bila
 * COA tidak punya akun persediaan (mis. usaha jasa).
 */
async function seedPersediaanControl(orgId: string, exec: Executor): Promise<void> {
  const orgAccounts = await exec
    .select()
    .from(accounts)
    .where(eq(accounts.orgId, orgId));
  const isParent = (code: string) => orgAccounts.some((a) => a.parentCode === code);
  const cands = orgAccounts.filter(
    (a) => a.code.startsWith("13") || a.name.toLowerCase().includes("persediaan"),
  );
  const invAcc =
    cands.find((a) => a.code === "1310" && !isParent(a.code)) ??
    cands.find((a) => !isParent(a.code)) ??
    cands[0] ??
    null;
  if (!invAcc) return;
  await exec
    .insert(subledgerControls)
    .values({ orgId, kind: "PERSEDIAAN", controlAccountId: invAcc.id })
    .onConflictDoNothing({ target: [subledgerControls.orgId, subledgerControls.kind] });
}
