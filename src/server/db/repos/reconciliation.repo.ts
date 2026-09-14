import { Db } from "../index";
import type { Queryable } from "./queryable";
import {
  bankReconciliations,
  bankStatementLines,
  type ReconciliationStatus,
  type StatementLineType,
  type MatchStatus,
} from "../schema/reconciliation";
import { accounts } from "../schema/org";
import { journalLines, journalEntries } from "../schema/journal";
import { eq, and, desc, sql, lte, isNull } from "drizzle-orm";
import { toMinor } from "./journals.repo";

export interface CreateReconciliationInput {
  bankAccountId: string;
  statementDate: string;
  statementBalanceMinor: bigint;
  ledgerBalanceMinor?: bigint;
  fileUrl?: string | null;
  notes?: string | null;
}

export interface SaveStatementLineInput {
  transactionDate: string;
  description: string;
  type: StatementLineType;
  amountMinor: bigint;
  referenceNumber?: string | null;
  confidenceScore?: number | null;
  aiNotes?: string | null;
}

export async function createReconciliationRepo(
  db: Db,
  orgId: string,
  input: CreateReconciliationInput
) {
  let ledgerBalanceMinor = input.ledgerBalanceMinor;

  if (ledgerBalanceMinor === undefined) {
    // Compute current ledger balance for this bank account up to statement date
    const lines = await db
      .select({
        debit: journalLines.debit,
        credit: journalLines.credit,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(
        and(
          eq(journalLines.orgId, orgId),
          eq(journalLines.accountId, input.bankAccountId),
          eq(journalEntries.status, "POSTED"),
          lte(journalEntries.entryDate, input.statementDate)
        )
      );

    let debitSum = 0n;
    let creditSum = 0n;
    for (const l of lines) {
      debitSum += toMinor(l.debit);
      creditSum += toMinor(l.credit);
    }
    // For asset account: Balance = Debit - Credit
    ledgerBalanceMinor = debitSum - creditSum;
  }

  const differenceMinor = input.statementBalanceMinor - ledgerBalanceMinor;

  const [created] = await db
    .insert(bankReconciliations)
    .values({
      orgId,
      bankAccountId: input.bankAccountId,
      statementDate: input.statementDate,
      statementBalanceMinor: input.statementBalanceMinor,
      ledgerBalanceMinor,
      differenceMinor,
      status: "IN_PROGRESS",
      fileUrl: input.fileUrl ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return created;
}

export async function saveStatementLinesRepo(
  db: Db,
  reconciliationId: string,
  lines: SaveStatementLineInput[]
) {
  if (lines.length === 0) return [];

  const inserted = await db
    .insert(bankStatementLines)
    .values(
      lines.map((l) => ({
        reconciliationId,
        transactionDate: l.transactionDate,
        description: l.description,
        type: l.type,
        amountMinor: l.amountMinor,
        referenceNumber: l.referenceNumber ?? null,
        confidenceScore: l.confidenceScore ?? null,
        aiNotes: l.aiNotes ?? null,
        matchStatus: "UNMATCHED" as MatchStatus,
      }))
    )
    .returning();

  return inserted;
}

export async function getReconciliationByIdRepo(
  q: Queryable,
  orgId: string,
  id: string
) {
  const [rec] = await q
    .select()
    .from(bankReconciliations)
    .where(and(eq(bankReconciliations.id, id), eq(bankReconciliations.orgId, orgId)));

  if (!rec) return null;

  const [bankAccount] = await q
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, rec.bankAccountId), eq(accounts.orgId, orgId)));

  const lines = await q
    .select()
    .from(bankStatementLines)
    .where(eq(bankStatementLines.reconciliationId, rec.id))
    .orderBy(desc(bankStatementLines.transactionDate));

  return {
    ...rec,
    bankAccount,
    lines,
  };
}

export async function listReconciliationsRepo(q: Queryable, orgId: string) {
  const rows = await q
    .select({
      reconciliation: bankReconciliations,
      bankAccount: accounts,
    })
    .from(bankReconciliations)
    .innerJoin(accounts, eq(bankReconciliations.bankAccountId, accounts.id))
    .where(eq(bankReconciliations.orgId, orgId))
    .orderBy(desc(bankReconciliations.statementDate), desc(bankReconciliations.createdAt));

  return rows.map((r) => ({
    ...r.reconciliation,
    bankAccountCode: r.bankAccount.code,
    bankAccountName: r.bankAccount.name,
  }));
}

export async function linkMatchedLineRepo(
  db: Db,
  statementLineId: string,
  journalLineId: string,
  confidenceScore?: number,
  aiNotes?: string
) {
  const [updated] = await db
    .update(bankStatementLines)
    .set({
      matchStatus: "MATCHED",
      matchedJournalLineId: journalLineId,
      confidenceScore: confidenceScore ?? 100,
      aiNotes: aiNotes ?? null,
    })
    .where(eq(bankStatementLines.id, statementLineId))
    .returning();

  return updated;
}

export async function unlinkMatchedLineRepo(db: Db, statementLineId: string) {
  const [updated] = await db
    .update(bankStatementLines)
    .set({
      matchStatus: "UNMATCHED",
      matchedJournalLineId: null,
      confidenceScore: null,
      aiNotes: null,
    })
    .where(eq(bankStatementLines.id, statementLineId))
    .returning();

  return updated;
}

export async function updateStatementLineStatusRepo(
  db: Db,
  statementLineId: string,
  status: MatchStatus
) {
  const [updated] = await db
    .update(bankStatementLines)
    .set({ matchStatus: status })
    .where(eq(bankStatementLines.id, statementLineId))
    .returning();

  return updated;
}

export async function finalizeReconciliationRepo(
  db: Db,
  orgId: string,
  reconciliationId: string,
  actorEmail: string
) {
  const [updated] = await db
    .update(bankReconciliations)
    .set({
      status: "COMPLETED",
      completedAt: new Date(),
      completedBy: actorEmail,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bankReconciliations.id, reconciliationId),
        eq(bankReconciliations.orgId, orgId)
      )
    )
    .returning();

  return updated;
}

export async function getUnmatchedLedgerLinesRepo(
  q: Queryable,
  orgId: string,
  bankAccountId: string,
  cutOffDate?: string
) {
  // Query all journal lines for this bank account that are not yet matched
  const conditions = [
    eq(journalLines.orgId, orgId),
    eq(journalLines.accountId, bankAccountId),
    eq(journalEntries.status, "POSTED"),
  ];

  if (cutOffDate) {
    conditions.push(lte(journalEntries.entryDate, cutOffDate));
  }

  const rows = await q
    .select({
      id: journalLines.id,
      entryId: journalLines.entryId,
      accountId: journalLines.accountId,
      debit: journalLines.debit,
      credit: journalLines.credit,
      memo: journalLines.memo,
      entryDate: journalEntries.entryDate,
      entryNumber: journalEntries.number,
      entryMemo: journalEntries.memo,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .leftJoin(
      bankStatementLines,
      eq(journalLines.id, bankStatementLines.matchedJournalLineId)
    )
    .where(and(...conditions, isNull(bankStatementLines.id)))
    .orderBy(desc(journalEntries.entryDate));

  return rows.map((r) => ({
    id: r.id,
    entryId: r.entryId,
    date: r.entryDate,
    number: r.entryNumber,
    memo: r.memo || r.entryMemo,
    debitMinor: toMinor(r.debit),
    creditMinor: toMinor(r.credit),
  }));
}
