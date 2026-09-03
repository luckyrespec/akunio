import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { executeNaraTool } from "@/server/ai/nara-tools";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema/org";
import { createReconciliationRepo } from "@/server/db/repos/reconciliation.repo";
import { eq, and } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Nara Bank Reconciliation Tools", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Nara Rec Tools Test")).orgId;
    await seedOrgData(orgId);
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("checks reconciliation status via get_bank_reconciliation_status", async () => {
    const [bank] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.orgId, orgId), eq(accounts.code, "1120")));

    expect(bank).toBeDefined();

    await createReconciliationRepo(db, orgId, {
      bankAccountId: bank.id,
      statementDate: "2026-08-31",
      statementBalanceMinor: 1000000000n,
    });

    const res = await executeNaraTool(orgId, "tester@test.id", "get_bank_reconciliation_status", {
      bankCode: "1120",
    });

    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    const data = res.data as Record<string, unknown>;
    expect(data.status).toBe("IN_PROGRESS");
    expect(data.statementBalanceFormatted).toBeDefined();
  });
});
