import { Db } from "@/server/db";
import { type Queryable } from "@/server/db/repos/queryable";
import { bankStatementLines, bankReconciliations } from "@/server/db/schema/reconciliation";
import { accounts } from "@/server/db/schema/org";
import { journalLines } from "@/server/db/schema/journal";
import { postJournalEntry } from "@/server/db/repos/journals.repo";
import { eq, and } from "drizzle-orm";

async function getAccountByCode(
  q: Queryable,
  orgId: string,
  code: string,
  fallbackCode = "5900",
  fallbackType: "BEBAN" | "PENDAPATAN" = "BEBAN"
) {
  const [row] = await q
    .select()
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.code, code)));

  if (row) return row;

  const [fallbackByCode] = await q
    .select()
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.code, fallbackCode)));

  if (fallbackByCode) return fallbackByCode;

  const [fallback] = await q
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.orgId, orgId),
        eq(accounts.type, fallbackType),
        eq(accounts.isCash, false)
      )
    )
    .limit(1);

  if (fallback) return fallback;

  throw new Error(`Akun COA '${code}' tidak ditemukan untuk organisasi ini.`);
}

export async function createBankFeeJournal(
  db: Db,
  orgId: string,
  statementLineId: string,
  actorEmail: string
): Promise<string> {
  const [line] = await db
    .select()
    .from(bankStatementLines)
    .where(eq(bankStatementLines.id, statementLineId));

  if (!line) {
    throw new Error(`Baris mutasi bank #${statementLineId} tidak ditemukan.`);
  }

  const [session] = await db
    .select()
    .from(bankReconciliations)
    .where(
      and(
        eq(bankReconciliations.id, line.reconciliationId),
        eq(bankReconciliations.orgId, orgId)
      )
    );

  if (!session) {
    throw new Error(`Sesi rekonsiliasi tidak ditemukan.`);
  }

  return db.transaction(async (tx) => {
    const feeAccount = await getAccountByCode(tx, orgId, "6200", "5900", "BEBAN");
    const bankAccount = await tx
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, session.bankAccountId), eq(accounts.orgId, orgId)))
      .then((res) => res[0]);

    if (!bankAccount) {
      throw new Error(`Akun bank sesi rekonsiliasi tidak ditemukan.`);
    }

    const memo = `Biaya Administrasi Bank: ${line.description}`;

    const entry = await postJournalEntry(
      tx,
      orgId,
      actorEmail,
      {
        dateISO: line.transactionDate,
        memo,
        source: "MANUAL",
        lines: [
          {
            accountId: feeAccount.id,
            debitMinor: line.amountMinor,
            creditMinor: 0n,
            memo: "Beban Administrasi Bank",
          },
          {
            accountId: bankAccount.id,
            debitMinor: 0n,
            creditMinor: line.amountMinor,
            memo: `Potongan Kas/Bank ${bankAccount.name}`,
          },
        ],
      }
    );

    // Find the journal line corresponding to bankAccount.id to link with statement line
    const [bankJournalLine] = await tx
      .select()
      .from(journalLines)
      .where(
        and(
          eq(journalLines.entryId, entry.id),
          eq(journalLines.accountId, bankAccount.id)
        )
      );

    await tx
      .update(bankStatementLines)
      .set({
        matchStatus: "MATCHED",
        matchedJournalLineId: bankJournalLine?.id ?? null,
        confidenceScore: 100,
        aiNotes: "Jurnal penyesuaian biaya administrasi bank dibuat otomatis",
      })
      .where(eq(bankStatementLines.id, line.id));

    return entry.id;
  });
}

export async function createBankInterestJournal(
  db: Db,
  orgId: string,
  statementLineId: string,
  actorEmail: string
): Promise<string> {
  const [line] = await db
    .select()
    .from(bankStatementLines)
    .where(eq(bankStatementLines.id, statementLineId));

  if (!line) {
    throw new Error(`Baris mutasi bank #${statementLineId} tidak ditemukan.`);
  }

  const [session] = await db
    .select()
    .from(bankReconciliations)
    .where(
      and(
        eq(bankReconciliations.id, line.reconciliationId),
        eq(bankReconciliations.orgId, orgId)
      )
    );

  if (!session) {
    throw new Error(`Sesi rekonsiliasi tidak ditemukan.`);
  }

  return db.transaction(async (tx) => {
    const revAccount = await getAccountByCode(tx, orgId, "4200", "4200", "PENDAPATAN");
    const bankAccount = await tx
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, session.bankAccountId), eq(accounts.orgId, orgId)))
      .then((res) => res[0]);

    if (!bankAccount) {
      throw new Error(`Akun bank sesi rekonsiliasi tidak ditemukan.`);
    }

    const memo = `Pendapatan Bunga / Jasa Giro: ${line.description}`;

    const entry = await postJournalEntry(
      tx,
      orgId,
      actorEmail,
      {
        dateISO: line.transactionDate,
        memo,
        source: "MANUAL",
        lines: [
          {
            accountId: bankAccount.id,
            debitMinor: line.amountMinor,
            creditMinor: 0n,
            memo: `Penerimaan Bunga Bank ${bankAccount.name}`,
          },
          {
            accountId: revAccount.id,
            debitMinor: 0n,
            creditMinor: line.amountMinor,
            memo: "Pendapatan Bunga Bank",
          },
        ],
      }
    );

    const [bankJournalLine] = await tx
      .select()
      .from(journalLines)
      .where(
        and(
          eq(journalLines.entryId, entry.id),
          eq(journalLines.accountId, bankAccount.id)
        )
      );

    await tx
      .update(bankStatementLines)
      .set({
        matchStatus: "MATCHED",
        matchedJournalLineId: bankJournalLine?.id ?? null,
        confidenceScore: 100,
        aiNotes: "Jurnal penyesuaian bunga bank dibuat otomatis",
      })
      .where(eq(bankStatementLines.id, line.id));

    return entry.id;
  });
}
