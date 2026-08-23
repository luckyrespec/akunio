import { and, asc, eq } from "drizzle-orm";
import { accounts } from "../schema/org";
import { journalEntries, journalLines } from "../schema/journal";
import type { Queryable } from "./queryable";
import { toMinor } from "./journals.repo";

type AccountRow = typeof accounts.$inferSelect;

export interface LedgerRow {
  number: string;
  entryDate: string;
  memo: string;
  debitMinor: bigint;
  creditMinor: bigint;
  balanceMinor: bigint;
}

export async function getLedger(
  q: Queryable, orgId: string, accountId: string,
): Promise<{ account: AccountRow; rows: LedgerRow[] }> {
  const accRows = await q.select().from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.id, accountId)))
    .limit(1);
  const account = accRows[0];
  if (!account) throw new Error("AKUN_TIDAK_DITEMUKAN");

  const raw = await q.select({
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
    .where(and(
      eq(journalLines.orgId, orgId),
      eq(journalLines.accountId, accountId),
      eq(journalEntries.status, "POSTED"),
    ))
    .orderBy(asc(journalEntries.entryDate), asc(journalEntries.seq), asc(journalLines.position));

  const isDebitNormal = account.normal === "D";
  let running = 0n;
  const rows: LedgerRow[] = raw.map((r) => {
    const d = toMinor(r.debit);
    const c = toMinor(r.credit);
    running += isDebitNormal ? d - c : c - d;
    return {
      number: r.number,
      entryDate: r.entryDate,
      memo: r.lineMemo ?? r.memo,
      debitMinor: d,
      creditMinor: c,
      balanceMinor: running,
    };
  });
  return { account, rows };
}
