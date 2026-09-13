import { and, asc, eq, gte, lt, lte } from "drizzle-orm";
import { accounts } from "../schema/org";
import { journalEntries, journalLines } from "../schema/journal";
import type { Queryable } from "./queryable";
import { toMinor } from "./journals.repo";

type AccountRow = typeof accounts.$inferSelect;

export interface LedgerRow {
  entryId: string;
  number: string;
  entryDate: string;
  memo: string;
  debitMinor: bigint;
  creditMinor: bigint;
  balanceMinor: bigint;
}

export interface LedgerRange {
  from?: string;
  to?: string;
}

export async function getLedger(
  q: Queryable, orgId: string, accountId: string, range?: LedgerRange,
): Promise<{ account: AccountRow; rows: LedgerRow[]; openingMinor: bigint }> {
  const accRows = await q.select().from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.id, accountId)))
    .limit(1);
  const account = accRows[0];
  if (!account) throw new Error("AKUN_TIDAK_DITEMUKAN");
  const isDebitNormal = account.normal === "D";

  const conds = [
    eq(journalLines.orgId, orgId),
    eq(journalEntries.orgId, orgId),
    eq(journalLines.accountId, accountId),
    eq(journalEntries.status, "POSTED"),
  ];
  if (range?.from) conds.push(gte(journalEntries.entryDate, range.from));
  if (range?.to) conds.push(lte(journalEntries.entryDate, range.to));

  const raw = await q.select({
    entryId: journalEntries.id,
    number: journalEntries.number,
    entryDate: journalEntries.entryDate,
    memo: journalEntries.memo,
    lineMemo: journalLines.memo,
    debit: journalLines.debit,
    credit: journalLines.credit,
    seq: journalEntries.seq,
    position: journalLines.position,
  })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(and(...conds))
    .orderBy(asc(journalEntries.entryDate), asc(journalEntries.seq), asc(journalLines.position));

  // Saldo awal dihitung via query agregat terpisah agar filter `from`
  // tetap di SQL tanpa kehilangan openingMinor.
  let opening = 0n;
  if (range?.from) {
    const openLines = await q.select({
      debit: journalLines.debit,
      credit: journalLines.credit,
    })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
      .where(and(
        eq(journalLines.orgId, orgId),
        eq(journalEntries.orgId, orgId),
        eq(journalLines.accountId, accountId),
        eq(journalEntries.status, "POSTED"),
        lt(journalEntries.entryDate, range.from),
      ));
    for (const r of openLines) {
      const d = toMinor(r.debit);
      const c = toMinor(r.credit);
      opening += isDebitNormal ? d - c : c - d;
    }
  }

  let running = opening;
  const rows: LedgerRow[] = [];
  for (const r of raw) {
    const d = toMinor(r.debit);
    const c = toMinor(r.credit);
    const delta = isDebitNormal ? d - c : c - d;
    running += delta;
    rows.push({
      entryId: r.entryId,
      number: r.number,
      entryDate: r.entryDate,
      memo: r.lineMemo ?? r.memo,
      debitMinor: d,
      creditMinor: c,
      balanceMinor: running,
    });
  }
  return { account, rows, openingMinor: opening };
}

export interface AccountBalance {
  id: string;
  code: string;
  name: string;
  type: AccountRow["type"];
  normal: "D" | "K";
  parentCode: string | null;
  archivedAt: Date | null;
  debitMinor: bigint;
  creditMinor: bigint;
  balanceMinor: bigint;
  transactionCount: number;
}

export async function listAccountsWithBalances(
  q: Queryable,
  orgId: string,
): Promise<AccountBalance[]> {
  const accRows = await q
    .select()
    .from(accounts)
    .where(eq(accounts.orgId, orgId))
    .orderBy(asc(accounts.code));

  const lines = await q
    .select({
      accountId: journalLines.accountId,
      debit: journalLines.debit,
      credit: journalLines.credit,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(
      and(
        eq(journalLines.orgId, orgId),
        eq(journalEntries.orgId, orgId),
        eq(journalEntries.status, "POSTED"),
      ),
    );

  const statsMap = new Map<string, { debitMinor: bigint; creditMinor: bigint; count: number }>();
  for (const line of lines) {
    const d = toMinor(line.debit);
    const c = toMinor(line.credit);
    const existing = statsMap.get(line.accountId) ?? { debitMinor: 0n, creditMinor: 0n, count: 0 };
    existing.debitMinor += d;
    existing.creditMinor += c;
    existing.count += 1;
    statsMap.set(line.accountId, existing);
  }

  return accRows.map((acc) => {
    const stats = statsMap.get(acc.id) ?? { debitMinor: 0n, creditMinor: 0n, count: 0 };
    const isDebitNormal = acc.normal === "D";
    const balanceMinor = isDebitNormal
      ? stats.debitMinor - stats.creditMinor
      : stats.creditMinor - stats.debitMinor;

    return {
      id: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      normal: acc.normal === "D" ? "D" : "K",
      parentCode: acc.parentCode,
      archivedAt: acc.archivedAt,
      debitMinor: stats.debitMinor,
      creditMinor: stats.creditMinor,
      balanceMinor,
      transactionCount: stats.count,
    };
  });
}
