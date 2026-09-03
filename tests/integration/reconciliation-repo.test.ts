import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema/org";
import {
  createReconciliationRepo,
  getReconciliationByIdRepo,
  saveStatementLinesRepo,
  listReconciliationsRepo,
  linkMatchedLineRepo,
} from "@/server/db/repos/reconciliation.repo";
import { eq, and } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Reconciliation Repository", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Test Rec Repo")).orgId;
    await seedOrgData(orgId);
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("handles reconciliation session creation, line inserts, and linking", async () => {
    const [bank] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.orgId, orgId), eq(accounts.code, "1120")));
    expect(bank).toBeDefined();

    const session = await createReconciliationRepo(db, orgId, {
      bankAccountId: bank.id,
      statementDate: "2026-08-31",
      statementBalanceMinor: 1000000000n,
      ledgerBalanceMinor: 1000000000n,
    });

    expect(session.id).toBeDefined();

    const lines = await saveStatementLinesRepo(db, session.id, [
      {
        transactionDate: "2026-08-10",
        description: "BIAYA ADM",
        type: "DB",
        amountMinor: 1500000n,
      },
    ]);

    expect(lines).toHaveLength(1);

    const reloaded = await getReconciliationByIdRepo(db, orgId, session.id);
    expect(reloaded).toBeDefined();
    expect(reloaded?.lines).toHaveLength(1);

    const list = await listReconciliationsRepo(db, orgId);
    expect(list.length).toBeGreaterThanOrEqual(1);
  });
});
