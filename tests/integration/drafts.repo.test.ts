import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { getPool, makeOrg, truncateAll } from "./helpers";

type AiDraftLike = { status: string; createdAt: Date };

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("drafts repo", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  let orgId: string;
  const draftBody = {
    dateISO: "2026-01-15", memo: "m",
    lines: [
      { accountCode: "1110", debitText: "1.000", creditText: "", confidence: 0.9, reason: "r" },
      { accountCode: "4100", debitText: "", creditText: "1.000", confidence: 0.9, reason: "r" },
    ],
    overallConfidence: 0.9, explanation: "e",
  };

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Draft")).orgId;
  });
  afterAll(async () => { await admin.end(); await truncateAll(); });

  it("creates, lists, and transitions drafts", async () => {
    const { createDraft, listDrafts, getDraft, setDraftStatus, countDraftsThisMonth } =
      await import("@/server/db/repos/drafts.repo");
    const { db } = await import("@/server/db");

    const d = await db.transaction((tx) => createDraft(tx, {
      orgId, kind: "TEXT", inputText: "beli perlengkapan", draft: draftBody, model: "mock",
    }));
    expect(d.status).toBe("PENDING");

    expect((await listDrafts(admin, orgId)).length).toBe(1);
    expect((await getDraft(admin, orgId, d.id))?.id).toBe(d.id);

    await db.transaction((tx) => setDraftStatus(tx, orgId, d.id, "REJECTED"));
    expect((await getDraft(admin, orgId, d.id))?.status).toBe("REJECTED");

    await expect(setDraftStatus(admin, orgId, crypto.randomUUID(), "PENDING"))
      .rejects.toThrow("DRAFT_TIDAK_DITEMUKAN");

    expect(await countDraftsThisMonth(admin, orgId, new Date())).toBe(1);
  });

  it("effectiveStatus expires PENDING after 7 days", async () => {
    const { effectiveStatus } = await import("@/server/db/repos/drafts.repo");
    const now = new Date("2026-01-20T00:00:00Z");
    const old: AiDraftLike = { status: "PENDING", createdAt: new Date("2026-01-10T00:00:00Z") };
    const fresh: AiDraftLike = { status: "PENDING", createdAt: new Date("2026-01-19T00:00:00Z") };
    expect(effectiveStatus(old as never, now)).toBe("REJECTED");
    expect(effectiveStatus(fresh as never, now)).toBe("PENDING");
  });

  it("checkQuota message", async () => {
    const { checkQuota } = await import("@/server/db/repos/drafts.repo");
    expect(checkQuota(99, 100).allowed).toBe(true);
    const over = checkQuota(100, 100);
    expect(over.allowed).toBe(false);
    expect(over.message).toContain("Kuota draft AI bulan ini habis");
  });
});
