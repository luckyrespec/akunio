import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema/org";
import { bankStatementLines } from "@/server/db/schema/reconciliation";
import {
  createReconciliationRepo,
  saveStatementLinesRepo,
} from "@/server/db/repos/reconciliation.repo";
import { createBankFeeJournal, createBankInterestJournal } from "@/server/reconciliation/quick-journal";
import { eq, and } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Reconciliation Quick Journal", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Test Quick Journal")).orgId;
    await seedOrgData(orgId);
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("creates a balanced bank fee journal and marks statement line as matched", async () => {
    const [bank] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.orgId, orgId), eq(accounts.code, "1120")));

    const session = await createReconciliationRepo(db, orgId, {
      bankAccountId: bank.id,
      statementDate: "2026-08-31",
      statementBalanceMinor: 500000000n,
      ledgerBalanceMinor: 500000000n,
    });

    const [line] = await saveStatementLinesRepo(db, session.id, [
      {
        transactionDate: "2026-08-31",
        description: "BIAYA ADM BULANAN",
        type: "DB",
        amountMinor: 1500000n,
      },
    ]);

    const journalId = await createBankFeeJournal(db, orgId, line.id, "test@neraca.id");
    expect(journalId).toBeDefined();

    const [updatedLine] = await db
      .select()
      .from(bankStatementLines)
      .where(eq(bankStatementLines.id, line.id));

    expect(updatedLine.matchStatus).toBe("MATCHED");
    expect(updatedLine.matchedJournalLineId).toBeDefined();
  });
});
