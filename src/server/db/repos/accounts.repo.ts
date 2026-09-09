import type { Queryable } from "./queryable";
import { accounts } from "../schema/org";
import { eq, asc, and, ilike, or } from "drizzle-orm";
import type { ReportAccountMeta } from "@/core/reports/aggregates";
import { checkPostingAccounts } from "@/core/journals/validate";

type AccountRow = typeof accounts.$inferSelect;

export async function listAccounts(q: Queryable, orgId: string, keyword?: string): Promise<AccountRow[]> {
  const term = keyword?.trim();
  if (!term) {
    return q.select().from(accounts).where(eq(accounts.orgId, orgId)).orderBy(asc(accounts.code));
  }
  const like = `%${term}%`;
  return q.select().from(accounts)
    .where(and(eq(accounts.orgId, orgId), or(ilike(accounts.code, like), ilike(accounts.name, like))))
    .orderBy(asc(accounts.code));
}

export async function getAccountById(q: Queryable, orgId: string, id: string) {
  const [row] = await q.select().from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.id, id))).limit(1);
  return row ?? null;
}

export async function setAccountArchived(
  q: Queryable, orgId: string, id: string, archivedAt: Date | null,
): Promise<AccountRow> {
  const [row] = await q.update(accounts)
    .set({ archivedAt })
    .where(and(eq(accounts.orgId, orgId), eq(accounts.id, id)))
    .returning();
  if (!row) throw new Error("AKUN_TIDAK_DITEMUKAN");
  return row;
}

export type AccountType = "ASET" | "LIABILITAS" | "EKUITAS" | "PENDAPATAN" | "BEBAN";

export async function createAccount(
  q: Queryable,
  input: {
    orgId: string;
    code: string;
    name: string;
    type: AccountType | "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
    normal: "D" | "K";
    parentCode?: string;
    contra?: boolean;
    isCash?: boolean;
    isBank?: boolean;
  },
): Promise<AccountRow> {
  const TYPE_MAP: Record<string, AccountType> = {
    ASSET: "ASET",
    LIABILITY: "LIABILITAS",
    EQUITY: "EKUITAS",
    REVENUE: "PENDAPATAN",
    EXPENSE: "BEBAN",
    ASET: "ASET",
    LIABILITAS: "LIABILITAS",
    EKUITAS: "EKUITAS",
    PENDAPATAN: "PENDAPATAN",
    BEBAN: "BEBAN",
  };
  const resolvedType = TYPE_MAP[input.type] ?? "BEBAN";

  const [row] = await q.insert(accounts).values({
    orgId: input.orgId,
    code: input.code,
    name: input.name,
    type: resolvedType,
    normal: input.normal,
    parentCode: input.parentCode ?? null,
    contra: input.contra ?? false,
    isCash: input.isCash ?? false,
    isBank: input.isBank ?? false,
  }).returning();
  return row;
}

export async function updateAccount(
  q: Queryable,
  orgId: string,
  id: string,
  patch: { name?: string; parentCode?: string | null },
): Promise<AccountRow> {
  const [row] = await q.update(accounts)
    .set({
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.parentCode !== undefined ? { parentCode: patch.parentCode } : {}),
    })
    .where(and(eq(accounts.orgId, orgId), eq(accounts.id, id)))
    .returning();
  if (!row) throw new Error("AKUN_TIDAK_DITEMUKAN");
  return row;
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
