import type { Queryable } from "./queryable";
import { accounts } from "../schema/org";
import { eq, asc } from "drizzle-orm";
import type { ReportAccountMeta } from "@/core/reports/aggregates";
import { checkPostingAccounts } from "@/core/journals/validate";

type AccountRow = typeof accounts.$inferSelect;

export async function listAccounts(q: Queryable, orgId: string): Promise<AccountRow[]> {
  return q.select().from(accounts).where(eq(accounts.orgId, orgId)).orderBy(asc(accounts.code));
}

export function postingMetaMap(
  rows: AccountRow[],
): Map<string, { archivedAt: Date | null; hasChildren: boolean }> {
  return new Map(rows.map((a) => [
    a.id,
    { archivedAt: a.archivedAt, hasChildren: rows.some((c) => c.parentCode === a.code) },
  ]));
}

export function reportMetaMap(rows: AccountRow[]): Map<string, ReportAccountMeta> {
  return new Map(rows.map((a) => [a.id, {
    id: a.id, code: a.code, name: a.name,
    type: a.type, normal: a.normal === "D" ? "D" : "K",
    contra: a.contra || undefined,
    isCash: a.isCash || undefined,
    isBank: a.isBank || undefined,
  }]));
}

export { checkPostingAccounts };
