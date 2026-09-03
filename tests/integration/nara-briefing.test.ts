import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { getDailyBriefingData } from "@/server/reports/briefing";
import { createDraft } from "@/server/db/repos/drafts.repo";
import { db } from "@/server/db";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Daily Briefing Service", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Briefing Test")).orgId;
    await seedOrgData(orgId);
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("calculates cash balance, pending drafts, unrecorded docs, and suggestion chips", async () => {
    // Create a pending draft
    await createDraft(db, {
      orgId,
      kind: "TEXT",
      inputText: "Beli pulpen 50rb",
      draft: {
        memo: "Beli pulpen",
        lines: [
          { accountCode: "5-2020", debitMinor: "50000", creditMinor: "0" },
          { accountCode: "1-1001", debitMinor: "0", creditMinor: "50000" },
        ],
      },
      model: "gemini-3.5-flash-lite",
    });

    const briefing = await getDailyBriefingData(orgId);

    expect(briefing.cashAndBank).toBeDefined();
    expect(typeof briefing.cashAndBank.current).toBe("string");
    expect(briefing.pendingDraftsCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(briefing.suggestions)).toBe(true);
    expect(briefing.suggestions).toContain("Review Draft");
  });
});
