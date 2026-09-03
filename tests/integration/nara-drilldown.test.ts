import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { makeOrg, truncateAll } from "./helpers";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { drilldownAccountDetails } from "@/server/reports/drilldown";
import { postJournalEntry } from "@/server/db/repos/journals.repo";
import { accounts } from "@/server/db/schema/org";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Account Drilldown Service", () => {
  let orgId: string;
  let kasId: string;
  let bebanId: string;
  const year = new Date().getFullYear();

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Drilldown Test")).orgId;
    await seedOrgData(orgId);

    const accs = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
    const byCode = Object.fromEntries(accs.map((a) => [a.code, a.id]));
    kasId = byCode["1110"];
    bebanId = byCode["5900"];
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("extracts line items and computes delta between two periods for an account", async () => {
    // Post transaction in July: 50.000 IDR = 5.000.000 minor units
    await postJournalEntry(db, orgId, "tester@test.id", {
      dateISO: `${year}-07-15`,
      memo: "Beli pulpen dan kertas",
      lines: [
        { accountId: bebanId, debitMinor: 5_000_000n, creditMinor: 0n },
        { accountId: kasId, debitMinor: 0n, creditMinor: 5_000_000n },
      ],
    });

    // Post transactions in August (includes a new expense)
    await postJournalEntry(db, orgId, "tester@test.id", {
      dateISO: `${year}-08-10`,
      memo: "Beli pulpen dan kertas",
      lines: [
        { accountId: bebanId, debitMinor: 5_000_000n, creditMinor: 0n },
        { accountId: kasId, debitMinor: 0n, creditMinor: 5_000_000n },
      ],
    });
    await postJournalEntry(db, orgId, "tester@test.id", {
      dateISO: `${year}-08-20`,
      memo: "Service AC kantor",
      lines: [
        { accountId: bebanId, debitMinor: 8_500_000n, creditMinor: 0n },
        { accountId: kasId, debitMinor: 0n, creditMinor: 8_500_000n },
      ],
    });

    const result = await drilldownAccountDetails(orgId, "5900", `${year}-08`, `${year}-07`);

    expect(result.accountCode).toBe("5900");
    expect(result.currentPeriodTotal).toBe("Rp135.000");
    expect(result.comparePeriodTotal).toBe("Rp50.000");
    expect(result.deltaPercentage).toBe("+170.0%");
    expect(result.items.some((i) => i.memo === "Service AC kantor")).toBe(true);
    expect(result.newExpenses.some((i) => i.memo === "Service AC kantor")).toBe(true);
  });
});
