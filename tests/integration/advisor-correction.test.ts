import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("advisor correction draft", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Correction")).orgId;
    const { seedOrgData } = await import("@/server/bootstrap/seed-org");
    await seedOrgData(orgId);
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("creates a correction draft from advisor suggestion", async () => {
    process.env.TEST_CTX_ORG = orgId;
    const { createCorrectionDraftAction } = await import("@/server/actions/advisor.actions");
    const mockDraft = {
      dateISO: "2026-01-15",
      memo: "Koreksi test",
      lines: [
        { accountCode: "1110", debitText: "100.000", creditText: "", confidence: 0.8, reason: "test" },
        { accountCode: "4100", debitText: "", creditText: "100.000", confidence: 0.8, reason: "test" },
      ],
      overallConfidence: 0.9,
      explanation: "test",
    };
    const res = await createCorrectionDraftAction({ threadId: "test-thread", draft: mockDraft });
    expect(res.ok).toBe(true);
    expect(res.draftId).toBeDefined();

    const { db } = await import("@/server/db");
    const { sql } = await import("drizzle-orm");
    const row = await db.execute(sql`SELECT draft, model FROM ai_drafts WHERE id = ${res.draftId}`);
    const r = (row as unknown as { rows: Array<{ draft: unknown; model: string }> }).rows[0];
    expect(r.model).toBe("advisor");
    delete process.env.TEST_CTX_ORG;
  });
});
