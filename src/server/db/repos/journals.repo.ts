import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { journalEntries, journalLines } from "../schema/journal";
import { accounts } from "../schema/org";
import type { Queryable } from "./queryable";
import { findPeriodByDate } from "./periods.repo";
import { postingMetaMap } from "./accounts.repo";
import {
  validateEntry, checkPostingAccounts, journalNumber,
} from "@/core/journals/validate";
import type { JournalEntryInput } from "@/core/journals/types";

export class PostingError extends Error {
  constructor(readonly issues: Array<Record<string, unknown>>) {
    super("VALIDASI_GAGAL");
  }
}

// numeric(18,2) text form from minor units — no float math.
export function dec(minor: bigint): string {
  const neg = minor < 0n;
  const v = neg ? -minor : minor;
  return `${neg ? "-" : ""}${v / 100n}.${String(v % 100n).padStart(2, "0")}`;
}

export function toMinor(numericStr: string): bigint {
  const neg = numericStr.startsWith("-");
  const s = neg ? numericStr.slice(1) : numericStr;
  const [w, f = ""] = s.split(".");
  const v = BigInt(w) * 100n + BigInt(f.padEnd(2, "0").slice(0, 2));
  return neg ? -v : v;
}

export interface LineView {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debitMinor: bigint;
  creditMinor: bigint;
  memo: string | null;
}

export interface EntryView {
  id: string;
  number: string;
  entryDate: string;
  memo: string;
  status: string;
  reversalOfId: string | null;
  lines: LineView[];
}

async function assemble(q: Queryable, where: SQL | undefined, limit?: number): Promise<EntryView[]> {
  const base = q.select().from(journalEntries).where(where);
  const entries = await (limit ? base.limit(limit) : base)
    .orderBy(desc(journalEntries.entryDate), desc(journalEntries.seq));
  if (entries.length === 0) return [];
  const lineRows = await q.select({
    id: journalLines.id,
    entryId: journalLines.entryId,
    accountId: journalLines.accountId,
    position: journalLines.position,
    debit: journalLines.debit,
    credit: journalLines.credit,
    memo: journalLines.memo,
    accountCode: accounts.code,
    accountName: accounts.name,
  })
    .from(journalLines)
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .where(inArray(journalLines.entryId, entries.map((e) => e.id)))
    .orderBy(asc(journalLines.position));

  const byEntry = new Map<string, EntryView>();
  for (const e of entries) {
    byEntry.set(e.id, {
      id: e.id, number: e.number, entryDate: e.entryDate, memo: e.memo,
      status: e.status, reversalOfId: e.reversalOfId, lines: [],
    });
  }
  for (const l of lineRows) {
    byEntry.get(l.entryId)!.lines.push({
      id: l.id, accountId: l.accountId, accountCode: l.accountCode, accountName: l.accountName,
      debitMinor: toMinor(l.debit), creditMinor: toMinor(l.credit), memo: l.memo,
    });
  }
  return [...byEntry.values()];
}

export async function listEntriesWithLines(
  q: Queryable, orgId: string, limit = 50,
): Promise<EntryView[]> {
  return assemble(q, eq(journalEntries.orgId, orgId), limit);
}

export async function getPostedEntry(
  q: Queryable, orgId: string, entryId: string,
): Promise<EntryView | null> {
  const rows = await assemble(q, and(eq(journalEntries.orgId, orgId), eq(journalEntries.id, entryId)));
  const entry = rows[0] ?? null;
  if (entry && entry.status !== "POSTED") throw new Error("BUKAN_JURNAL_POSTED");
  return entry;
}

export interface PostResult { id: string; number: string }

export async function postJournalEntry(
  q: Queryable,
  orgId: string,
  actorEmail: string,
  input: JournalEntryInput,
  opts: { reversalOfId?: string } = {},
): Promise<PostResult> {
  if (input.idempotencyKey) {
    const [dupe] = await q.select({ id: journalEntries.id, number: journalEntries.number })
      .from(journalEntries)
      .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (dupe) return dupe;
  }

  const period = await findPeriodByDate(q, orgId, input.dateISO);
  if (!period) throw new PostingError([{ code: "PERIODE_TIDAK_DITEMUKAN" }]);

  const issues = validateEntry(input, period.status);
  if (issues.length > 0) throw new PostingError(issues);

  const orgAccounts = await q.select().from(accounts).where(eq(accounts.orgId, orgId));
  const acctIssues = checkPostingAccounts(input.lines, postingMetaMap(orgAccounts));
  if (acctIssues.length > 0) throw new PostingError(acctIssues);

  // Numbers are year-scoped (JE-YYYY-NNNN unique per org) while counters are
  // stored per period; the xact lock makes the cross-period read-modify-write
  // atomic against other postings in the same org-year.
  const year = period.name.slice(0, 4);
  await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${orgId}:${year}`}))`);
  const counterRes = await q.execute(sql`
    INSERT INTO journal_seq_counters (org_id, period_id, last)
    VALUES (${orgId}, ${period.id}, 1)
    ON CONFLICT (org_id, period_id)
    DO UPDATE SET last = journal_seq_counters.last + 1
    RETURNING last
  `);
  const periodSeq = Number((counterRes.rows?.[0] as { last: number } | undefined)?.last ?? 1);
  const baseRes = await q.execute<{ base: number }>(sql`
    SELECT COALESCE(SUM(c.last), 0)::int AS base
    FROM journal_seq_counters c
    JOIN fiscal_periods p ON p.id = c.period_id
    WHERE c.org_id = ${orgId} AND left(p.name, 4) = ${year} AND c.period_id <> ${period.id}
  `);
  const seq = periodSeq + Number(baseRes.rows?.[0]?.base ?? 0);
  const number = journalNumber(period.name, seq);

  const [entry] = await q.insert(journalEntries).values({
    orgId,
    periodId: period.id,
    seq,
    number,
    entryDate: input.dateISO,
    memo: input.memo,
    source: input.source ?? "MANUAL",
    status: "DRAFT",
    reversalOfId: opts.reversalOfId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
  }).returning({ id: journalEntries.id });

  await q.insert(journalLines).values(input.lines.map((l, i) => ({
    orgId,
    entryId: entry.id,
    accountId: l.accountId,
    position: i,
    debit: dec(l.debitMinor),
    credit: dec(l.creditMinor),
    memo: l.memo ?? null,
  })));

  await q.update(journalEntries)
    .set({ status: "POSTED", postedAt: new Date(), postedBy: actorEmail })
    .where(and(eq(journalEntries.id, entry.id), eq(journalEntries.status, "DRAFT")));

  return { id: entry.id, number };
}
