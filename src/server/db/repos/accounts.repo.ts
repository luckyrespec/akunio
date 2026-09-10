import type { Queryable } from "./queryable";
import { accounts } from "../schema/org";
import { eq, asc, and, ilike, or } from "drizzle-orm";
import type { ReportAccountMeta } from "@/core/reports/aggregates";
import { checkPostingAccounts } from "@/core/journals/validate";

export type AccountRow = typeof accounts.$inferSelect;

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
): Map<string, { archivedAt: Date | null; hasChildren: boolean; code: string }> {
  return new Map(rows.map((a) => [
    a.id,
    { archivedAt: a.archivedAt, hasChildren: rows.some((c) => c.parentCode === a.code), code: a.code },
  ]));
}

/** Akun siap posting = tak-diarsip dan bukan induk (kriteria identik guard GROUP_ACCOUNT).
 *  Fallback kode mentah (cth. 4100/5100) bisa berupa akun GRUP pada COA hasil
 *  onboarding (punya anak) — resolver di bawah memilih detail postable. */
export function isPostableAccount(rows: AccountRow[], a: AccountRow): boolean {
  return !a.archivedAt && !rows.some((c) => c.parentCode === a.code);
}

function firstByCode(rows: AccountRow[]): AccountRow | undefined {
  return [...rows].sort((x, y) => x.code.localeCompare(y.code))[0];
}

/** Pendapatan: preferensi item → 4110 → detail PENDAPATAN-K pertama. */
export function resolveRevenueAccountId(rows: AccountRow[], preferredId: string | null): string {
  const byId = new Map(rows.map((a) => [a.id, a]));
  const pref = preferredId ? byId.get(preferredId) : undefined;
  if (pref && isPostableAccount(rows, pref)) return pref.id;
  const c4110 = rows.find((a) => a.code === "4110");
  if (c4110 && isPostableAccount(rows, c4110)) return c4110.id;
  const first = firstByCode(rows.filter(
    (a) => a.type === "PENDAPATAN" && a.normal === "K" && !a.contra && isPostableAccount(rows, a),
  ));
  if (first) return first.id;
  throw new Error("AKUN_PENDAPATAN_TIDAK_ADA: tidak ada akun pendapatan siap posting di COA");
}

/** HPP: setting → detail BEBAN 51xx pertama → BEBAN-D pertama. */
export function resolveCogsAccountId(rows: AccountRow[], preferredId: string | null): string {
  const byId = new Map(rows.map((a) => [a.id, a]));
  const pref = preferredId ? byId.get(preferredId) : undefined;
  if (pref && isPostableAccount(rows, pref)) return pref.id;
  const child51 = firstByCode(rows.filter(
    (a) => a.type === "BEBAN" && a.code.startsWith("51") && isPostableAccount(rows, a),
  ));
  if (child51) return child51.id;
  const anyBeban = firstByCode(rows.filter(
    (a) => a.type === "BEBAN" && a.normal === "D" && !a.contra && isPostableAccount(rows, a),
  ));
  if (anyBeban) return anyBeban.id;
  throw new Error("AKUN_HPP_TIDAK_ADA: tidak ada akun beban siap posting di COA");
}

/** Beban umum (jasa beli): preferensi item → BEBAN-D pertama. */
export function resolveExpenseAccountId(rows: AccountRow[], preferredId: string | null): string {
  const byId = new Map(rows.map((a) => [a.id, a]));
  const pref = preferredId ? byId.get(preferredId) : undefined;
  if (pref && isPostableAccount(rows, pref)) return pref.id;
  const first = firstByCode(rows.filter(
    (a) => a.type === "BEBAN" && a.normal === "D" && !a.contra && isPostableAccount(rows, a),
  ));
  if (first) return first.id;
  throw new Error("AKUN_BEBAN_TIDAK_ADA: tidak ada akun beban siap posting di COA");
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
