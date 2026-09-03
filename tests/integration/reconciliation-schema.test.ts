import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema/org";
import { bankReconciliations, bankStatementLines } from "@/server/db/schema/reconciliation";
import { eq, and } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Bank Reconciliation Database Schema", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Test Bank Rec Schema")).orgId;
    await seedOrgData(orgId);
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("creates a bank reconciliation session and child statement lines", async () => {
    const [bankAcc] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.orgId, orgId), eq(accounts.code, "1120")));

    expect(bankAcc).toBeDefined();

    const [rec] = await db
      .insert(bankReconciliations)
      .values({
        orgId,
        bankAccountId: bankAcc.id,
        statementDate: "2026-08-31",
        statementBalanceMinor: 2500000000n, // Rp 25.000.000
        ledgerBalanceMinor: 2500000000n,
        differenceMinor: 0n,
        status: "IN_PROGRESS",
      })
      .returning();

    expect(rec.id).toBeDefined();
    expect(rec.status).toBe("IN_PROGRESS");

    const [line] = await db
      .insert(bankStatementLines)
      .values({
        reconciliationId: rec.id,
        transactionDate: "2026-08-15",
        description: "TRSF CR DARI PELANGGAN",
        type: "CR",
        amountMinor: 500000000n, // Rp 5.000.000
        matchStatus: "UNMATCHED",
      })
      .returning();

    expect(line.id).toBeDefined();
    expect(line.amountMinor).toBe(500000000n);
  });
});
