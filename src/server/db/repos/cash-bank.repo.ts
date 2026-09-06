import { and, asc, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { kasBankEntries, type CashKind } from "../schema/cash-bank";
import { accounts } from "../schema/org";
import { contacts } from "../schema/invoicing";
import { journalEntries, journalLines } from "../schema/journal";
import type { Queryable } from "./queryable";
import {
  createDraftJournalEntry,
  postDraftEntry,
  postJournalEntry,
  toMinor,
} from "./journals.repo";
import {
  planCashJournal,
  cashNumber,
  CashValidationError,
} from "@/core/kas-bank/kas-bank";
import type { JournalSource } from "@/core/journals/types";

const SOURCE_BY_KIND: Record<CashKind, JournalSource> = {
  BAYAR: "KAS_BAYAR",
  TERIMA: "KAS_TERIMA",
  TRANSFER: "KAS_TRANSFER",
};

export interface CreateCashInput {
  kind: CashKind;
  entryDate: string;
  cashAccountId: string;
  counterAccountId: string;
  contactId?: string | null;
  amountMinor: bigint;
  memo: string;
  idempotencyKey?: string;
}

async function assertCashAccounts(
  q: Queryable,
  orgId: string,
  kind: CashKind,
  cashId: string,
  counterId: string
) {
  const rows = await q
    .select({
      id: accounts.id,
      isCash: accounts.isCash,
      archivedAt: accounts.archivedAt,
    })
    .from(accounts)
    .where(eq(accounts.orgId, orgId));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const cash = byId.get(cashId);
  const counter = byId.get(counterId);
  if (!cash || !counter)
    throw new CashValidationError("AKUN_TIDAK_DITEMUKAN");
  if (cash.archivedAt || counter.archivedAt)
    throw new CashValidationError("AKUN_DIARSIPKAN");
  planCashJournal(kind, {
    cashAccountId: cashId,
    counterAccountId: counterId,
    cashIsCash: cash.isCash ?? false,
    counterIsCash: counter.isCash ?? false,
    memo: "",
  });
}

async function nextNumber(
  q: Queryable,
  orgId: string,
  kind: CashKind,
  entryDate: string
): Promise<string> {
  const year = entryDate.slice(0, 4);
  await q.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`${orgId}:kas:${year}:${kind}`}))`
  );
  const res = await q.execute(sql`
    INSERT INTO kas_bank_seq_counters (org_id, year, kind, last)
    VALUES (${orgId}, ${year}, ${kind}, 1)
    ON CONFLICT (org_id, year, kind)
    DO UPDATE SET last = kas_bank_seq_counters.last + 1
    RETURNING last
  `);
  const seq = Number((res.rows?.[0] as { last: number } | undefined)?.last ?? 1);
  return cashNumber(kind, year, seq);
}

export async function createCashEntryRepo(
  q: Queryable,
  orgId: string,
  actorEmail: string,
  input: CreateCashInput,
  opts: { post: boolean }
) {
  if (input.amountMinor <= 0n)
    throw new CashValidationError("NOMINAL_HARUS_POSITIF");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.entryDate))
    throw new CashValidationError("TANGGAL_TIDAK_VALID");
  await assertCashAccounts(
    q,
    orgId,
    input.kind,
    input.cashAccountId,
    input.counterAccountId
  );
  const plan = planCashJournal(input.kind, {
    cashAccountId: input.cashAccountId,
    counterAccountId: input.counterAccountId,
    cashIsCash: true,
    counterIsCash: input.kind === "TRANSFER",
    memo: input.memo,
  });
  const journalInput = {
    dateISO: input.entryDate,
    memo: input.memo || `${input.kind} ${input.entryDate}`,
    source: SOURCE_BY_KIND[input.kind],
    idempotencyKey: input.idempotencyKey,
    lines: [
      {
        accountId: plan.debitAccountId,
        debitMinor: input.amountMinor,
        creditMinor: 0n,
      },
      {
        accountId: plan.creditAccountId,
        debitMinor: 0n,
        creditMinor: input.amountMinor,
      },
    ],
  };
  const je = opts.post
    ? await postJournalEntry(q, orgId, actorEmail, journalInput)
    : await createDraftJournalEntry(q, orgId, journalInput);
  const number = await nextNumber(q, orgId, input.kind, input.entryDate);
  const [row] = await q
    .insert(kasBankEntries)
    .values({
      orgId,
      kind: input.kind,
      entryDate: input.entryDate,
      cashAccountId: input.cashAccountId,
      counterAccountId: input.counterAccountId,
      contactId: input.contactId ?? null,
      amountMinor: input.amountMinor,
      memo: input.memo,
      number,
      journalEntryId: je.id,
      status: opts.post ? "POSTED" : "DRAFT",
      createdBy: actorEmail,
    })
    .returning({ id: kasBankEntries.id });
  return { id: row.id, number, journalEntryId: je.id, journalNumber: je.number };
}

export async function postCashDraftRepo(
  q: Queryable,
  orgId: string,
  actorEmail: string,
  id: string
) {
  const [row] = await q
    .select()
    .from(kasBankEntries)
    .where(and(eq(kasBankEntries.orgId, orgId), eq(kasBankEntries.id, id)))
    .limit(1);
  if (!row) throw new CashValidationError("ENTRI_TIDAK_DITEMUKAN");
  if (row.status === "POSTED" || !row.journalEntryId)
    return { id: row.id, number: row.number };
  await postDraftEntry(q, orgId, actorEmail, row.journalEntryId);
  await q
    .update(kasBankEntries)
    .set({ status: "POSTED", updatedAt: new Date() })
    .where(eq(kasBankEntries.id, row.id));
  return { id: row.id, number: row.number };
}

export interface CashEntryRow {
  id: string;
  kind: CashKind;
  number: string;
  entryDate: string;
  memo: string;
  amountMinor: bigint;
  status: "DRAFT" | "POSTED";
  journalEntryId: string | null;
  cashCode: string;
  cashName: string;
  counterCode: string;
  counterName: string;
}

export async function listCashEntriesRepo(
  q: Queryable,
  orgId: string,
  kind?: CashKind,
  limit = 50
): Promise<CashEntryRow[]> {
  const where = kind
    ? and(eq(kasBankEntries.orgId, orgId), eq(kasBankEntries.kind, kind))
    : eq(kasBankEntries.orgId, orgId);
  const entries = await q
    .select()
    .from(kasBankEntries)
    .where(where)
    .orderBy(desc(kasBankEntries.entryDate), desc(kasBankEntries.createdAt))
    .limit(limit);
  const acctRows = await q
    .select({ id: accounts.id, code: accounts.code, name: accounts.name })
    .from(accounts)
    .where(eq(accounts.orgId, orgId));
  const byId = new Map(acctRows.map((a) => [a.id, a]));
  return entries.map((e) => ({
    id: e.id,
    kind: e.kind,
    number: e.number,
    entryDate: e.entryDate,
    memo: e.memo,
    amountMinor: e.amountMinor,
    status: e.status,
    journalEntryId: e.journalEntryId,
    cashCode: byId.get(e.cashAccountId)?.code ?? "?",
    cashName: byId.get(e.cashAccountId)?.name ?? "?",
    counterCode: byId.get(e.counterAccountId)?.code ?? "?",
    counterName: byId.get(e.counterAccountId)?.name ?? "?",
  }));
}

export interface CashSummary {
  postedTotalMinor: bigint;
  draftCount: number;
}

/** Total POSTED + hitungan DRAFT untuk satu kind dalam rentang tanggal. */
export async function getCashSummaryRepo(
  q: Queryable,
  orgId: string,
  kind: CashKind,
  fromISO: string,
  toISO: string
): Promise<CashSummary> {
  const [posted] = await q
    .select({ total: sql<string>`COALESCE(SUM(${kasBankEntries.amountMinor}), 0)` })
    .from(kasBankEntries)
    .where(
      and(
        eq(kasBankEntries.orgId, orgId),
        eq(kasBankEntries.kind, kind),
        eq(kasBankEntries.status, "POSTED"),
        gte(kasBankEntries.entryDate, fromISO),
        lte(kasBankEntries.entryDate, toISO)
      )
    );
  const [draft] = await q
    .select({ n: sql<number>`count(*)::int` })
    .from(kasBankEntries)
    .where(
      and(
        eq(kasBankEntries.orgId, orgId),
        eq(kasBankEntries.kind, kind),
        eq(kasBankEntries.status, "DRAFT")
      )
    );
  return {
    postedTotalMinor: BigInt(posted?.total ?? 0),
    draftCount: draft?.n ?? 0,
  };
}

export interface CashEntryDetail {
  id: string;
  kind: CashKind;
  number: string;
  entryDate: string;
  memo: string;
  amountMinor: bigint;
  status: "DRAFT" | "POSTED";
  journalEntryId: string | null;
  createdBy: string | null;
  cashCode: string;
  cashName: string;
  counterCode: string;
  counterName: string;
  contactName: string | null;
}

/** Satu entri kas-bank beserta nama akun dan kontak, atau null bila tak ada. */
export async function getCashEntryDetailRepo(
  q: Queryable,
  orgId: string,
  id: string
): Promise<CashEntryDetail | null> {
  const [row] = await q
    .select()
    .from(kasBankEntries)
    .where(and(eq(kasBankEntries.orgId, orgId), eq(kasBankEntries.id, id)))
    .limit(1);
  if (!row) return null;
  const acctRows = await q
    .select({ id: accounts.id, code: accounts.code, name: accounts.name })
    .from(accounts)
    .where(eq(accounts.orgId, orgId));
  const byId = new Map(acctRows.map((a) => [a.id, a]));
  let contactName: string | null = null;
  if (row.contactId) {
    const [c] = await q
      .select({ name: contacts.name })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.id, row.contactId)))
      .limit(1);
    contactName = c?.name ?? null;
  }
  return {
    id: row.id,
    kind: row.kind,
    number: row.number,
    entryDate: row.entryDate,
    memo: row.memo,
    amountMinor: row.amountMinor,
    status: row.status,
    journalEntryId: row.journalEntryId,
    createdBy: row.createdBy,
    cashCode: byId.get(row.cashAccountId)?.code ?? "?",
    cashName: byId.get(row.cashAccountId)?.name ?? "?",
    counterCode: byId.get(row.counterAccountId)?.code ?? "?",
    counterName: byId.get(row.counterAccountId)?.name ?? "?",
    contactName,
  };
}

export interface CashHistoryRow {
  entryId: string;
  entryDate: string;
  memo: string;
  number: string;
  debitMinor: bigint;
  creditMinor: bigint;
  balanceMinor: bigint;
}

export async function getCashHistoryRepo(
  q: Queryable,
  orgId: string,
  cashAccountId: string,
  fromISO: string,
  toISO: string
) {
  const [acct] = await q
    .select({ id: accounts.id, code: accounts.code, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.id, cashAccountId)))
    .limit(1);
  if (!acct) throw new CashValidationError("AKUN_TIDAK_DITEMUKAN");
  const [before] = await q
    .select({
      debit: sql<string>`COALESCE(SUM(${journalLines.debit}), 0)`,
      credit: sql<string>`COALESCE(SUM(${journalLines.credit}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(
      and(
        eq(journalLines.orgId, orgId),
        eq(journalLines.accountId, cashAccountId),
        eq(journalEntries.status, "POSTED"),
        lt(journalEntries.entryDate, fromISO)
      )
    );
  const openingMinor =
    toMinor(String(before?.debit ?? "0")) -
    toMinor(String(before?.credit ?? "0"));
  const lines = await q
    .select({
      entryId: journalLines.entryId,
      debit: journalLines.debit,
      credit: journalLines.credit,
      entryDate: journalEntries.entryDate,
      memo: journalEntries.memo,
      number: journalEntries.number,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(
      and(
        eq(journalLines.orgId, orgId),
        eq(journalLines.accountId, cashAccountId),
        eq(journalEntries.status, "POSTED"),
        gte(journalEntries.entryDate, fromISO),
        lte(journalEntries.entryDate, toISO)
      )
    )
    .orderBy(asc(journalEntries.entryDate), asc(journalLines.id));
  let balance = openingMinor;
  const rows: CashHistoryRow[] = lines.map((l) => {
    balance += toMinor(l.debit) - toMinor(l.credit);
    return {
      entryId: l.entryId,
      entryDate: l.entryDate,
      memo: l.memo,
      number: l.number,
      debitMinor: toMinor(l.debit),
      creditMinor: toMinor(l.credit),
      balanceMinor: balance,
    };
  });
  return { account: acct, openingMinor, rows };
}
