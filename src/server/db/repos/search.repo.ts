import { and, eq, gte, ilike, lte, or } from "drizzle-orm";
import { journalEntries } from "../schema/journal";
import { accounts } from "../schema/org";
import type { Queryable } from "./queryable";

export async function searchJournals(
  q: Queryable,
  orgId: string,
  term: string,
  limit = 5,
  opts: { dateFrom?: string; dateTo?: string } = {},
) {
  const like = `%${term}%`;
  const conds = [
    eq(journalEntries.orgId, orgId),
    or(ilike(journalEntries.number, like), ilike(journalEntries.memo, like)),
  ];
  if (opts.dateFrom) conds.push(gte(journalEntries.entryDate, opts.dateFrom));
  if (opts.dateTo) conds.push(lte(journalEntries.entryDate, opts.dateTo));
  return q
    .select({ id: journalEntries.id, number: journalEntries.number, memo: journalEntries.memo, entryDate: journalEntries.entryDate })
    .from(journalEntries)
    .where(and(...conds))
    .limit(limit);
}

export async function searchAccounts(
  q: Queryable,
  orgId: string,
  term: string,
  limit = 5,
) {
  const like = `%${term}%`;
  return q
    .select({ id: accounts.id, code: accounts.code, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), or(ilike(accounts.code, like), ilike(accounts.name, like))))
    .limit(limit);
}
