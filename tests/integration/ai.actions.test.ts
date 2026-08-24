import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

process.env.AI_MOCK = "1";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("ai actions", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  let orgId: string;
  let kasId = "", bebanId = "";

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Copilot")).orgId;
    process.env.TEST_CTX_ORG = orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await admin.query(`SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const by = Object.fromEntries(rows.rows.map((r: { code: string; id: string }) => [r.code, r.id]));
    kasId = by["1110"]; bebanId = by["5900"];
  });
  afterAll(async () => {
    delete process.env.TEST_CTX_ORG;
    await admin.end();
    await truncateAll();
  });

  it("creates a draft from text with mapped accounts", async () => {
    const mod = await import("@/server/actions/ai.actions");
    const res = await mod.createDraftAction({ text: "beli perlengkapan kantor tunai Rp 500.000" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = await mod.getDraftForTest(orgId, res.draftId!);
    expect(row?.status).toBe("PENDING");
    const lines = (row?.draft as { lines: Array<{ accountCode: string }> }).lines;
    expect(lines.map((l) => l.accountCode).sort()).toEqual(["1110", "5900"]);
  });

  it("rejects empty text and enforces quota limit=1", async () => {
    const mod = await import("@/server/actions/ai.actions");
    const empty = await mod.createDraftAction({ text: "   " });
    expect(empty.ok).toBe(false);

    const prev = process.env.AI_MONTHLY_DRAFT_LIMIT;
    process.env.AI_MONTHLY_DRAFT_LIMIT = "1";
    const over = await mod.createDraftAction({ text: "beli lagi sesuatu" });
    process.env.AI_MONTHLY_DRAFT_LIMIT = prev;
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toContain("Kuota draft AI bulan ini habis");
  });

  it("reject action flips status", async () => {
    const mod = await import("@/server/actions/ai.actions");
    const created = await mod.createDraftAction({ text: "beli stiker 20.000 tunai" });
    if (!created.ok) throw new Error("setup failed");
    const r = await mod.rejectDraftAction(created.draftId!);
    expect(r.ok).toBe(true);
  });

  it("accept posts through the M1 pipeline and links the entry", async () => {
    const mod = await import("@/server/actions/ai.actions");
    const created = await mod.createDraftAction({ text: "beli amplop 30.000 tunai" });
    if (!created.ok) throw new Error("setup failed");

    const year = new Date().getFullYear();
    const res = await mod.acceptDraftAction(created.draftId!, {
      dateISO: `${year}-01-15`, memo: "beli amplop",
      lines: [
        { accountId: bebanId, debitText: "30.000", creditText: "" },
        { accountId: kasId, debitText: "", creditText: "30.000" },
      ],
    });
    expect(res.ok).toBe(true);
    expect(res.number).toBe(`JE-${year}-0001`);

    const row = await admin.query(
      `SELECT status, posted_entry_id FROM ai_drafts WHERE id=$1`, [created.draftId]);
    expect(row.rows[0].status).toBe("ACCEPTED");
    expect(row.rows[0].posted_entry_id).not.toBeNull();
    const src = await admin.query(
      `SELECT source FROM journal_entries WHERE id=$1`, [row.rows[0].posted_entry_id]);
    expect(src.rows[0].source).toBe("AI");
  });

  it("accept with unbalanced edit fails with Indonesian message", async () => {
    const mod = await import("@/server/actions/ai.actions");
    const created = await mod.createDraftAction({ text: "beli kertas 10.000 tunai" });
    if (!created.ok) throw new Error("setup failed");
    const year = new Date().getFullYear();
    const res = await mod.acceptDraftAction(created.draftId!, {
      dateISO: `${year}-01-16`, memo: "x",
      lines: [
        { accountId: bebanId, debitText: "10.000", creditText: "" },
        { accountId: kasId, debitText: "", creditText: "9.000" },
      ],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("tidak seimbang");
    const row = await admin.query(`SELECT status FROM ai_drafts WHERE id=$1`, [created.draftId]);
    expect(row.rows[0].status).toBe("PENDING");
  });
});
