import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("account proposal atomicity", () => {
  let orgId: string;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Akun")).orgId;
    process.env.TEST_CTX_ORG = orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
  });
  afterAll(async () => {
    delete process.env.TEST_CTX_ORG;
    await admin.end();
    await truncateAll();
  });

  it("validateAccountProposal rejects duplicate code and bad parent", async () => {
    const { validateAccountProposal } = await import("@/server/accounts/propose");
    const { db } = await import("@/server/db");
    await expect(db.transaction((tx) =>
      validateAccountProposal(tx as never, orgId, {
        code: "1110", name: "Duplikat", type: "ASET", normal: "D",
        parentCode: "1100", reason: "x",
      }),
    )).rejects.toThrow(/USULAN_AKUN_TIDAK_VALID/);
    await expect(db.transaction((tx) =>
      validateAccountProposal(tx as never, orgId, {
        code: "1190", name: "X", type: "ASET", normal: "D",
        parentCode: "9999", reason: "x",
      }),
    )).rejects.toThrow(/USULAN_AKUN_TIDAK_VALID/);
  });

  it("accepts a well-formed proposal shape", async () => {
    const { validateAccountProposal } = await import("@/server/accounts/propose");
    const { db } = await import("@/server/db");
    await db.transaction(async (tx) => {
      await validateAccountProposal(tx as never, orgId, {
        code: "1190", name: "Uang Muka", type: "ASET", normal: "D",
        parentCode: "1100", reason: "penampung",
      });
    });
  });

  it("validateAccountProposal rejects placeholder names (R6 fail-closed)", async () => {
    const { validateAccountProposal } = await import("@/server/accounts/propose");
    const { db } = await import("@/server/db");
    await expect(db.transaction((tx) =>
      validateAccountProposal(tx as never, orgId, {
        code: "1190", name: "Akun 1190", type: "ASET", normal: "D",
        parentCode: "1100", reason: "placeholder Task 7",
      }),
    )).rejects.toThrow(/USULAN_AKUN_TIDAK_VALID/);
  });

  it("acceptDraftAction fails closed on placeholder proposals with zero orphan accounts", async () => {
    const { db } = await import("@/server/db");
    const { createDraft } = await import("@/server/db/repos/drafts.repo");
    const mod = await import("@/server/actions/ai.actions");
    const year = new Date().getFullYear();
    const draft = await db.transaction((tx) =>
      createDraft(tx as never, {
        orgId, kind: "TEXT", inputText: "koreksi temuan",
        draft: {
          dateISO: `${year}-06-01`, memo: "koreksi",
          lines: [
            { accountCode: "1190", debitText: "10.000", creditText: "", confidence: 0.45, reason: "x" },
            { accountCode: "1110", debitText: "", creditText: "10.000", confidence: 1.0, reason: "x" },
          ],
          overallConfidence: 0.7, explanation: "koreksi temuan",
          accountProposals: [
            {
              code: "1190", name: "Akun 1190", type: "ASET", normal: "D",
              parentCode: "1100", reason: "masih placeholder",
            },
          ],
        },
        model: "doctor-sak",
      }));
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    const res = await mod.acceptDraftAction(draft.id, {
      dateISO: `${year}-06-01`, memo: "koreksi",
      lines: [
        { accountId: "", debitText: "10.000", creditText: "" },
        { accountId: byCode["1110"], debitText: "", creditText: "10.000" },
      ],
    });
    expect(res.ok).toBe(false);
    const check = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM accounts WHERE org_id=$1 AND code='1190'`, [orgId]);
    expect(Number(check.rows[0].n)).toBe(0);
    const st = await admin.query<{ status: string }>(
      `SELECT status FROM ai_drafts WHERE id=$1`, [draft.id]);
    expect(st.rows[0].status).toBe("PENDING");
  });

  it("acceptDraftAction posts fully manually-resolved drafts without creating placeholder accounts (D8)", async () => {
    const { db } = await import("@/server/db");
    const { createDraft } = await import("@/server/db/repos/drafts.repo");
    const mod = await import("@/server/actions/ai.actions");
    const year = new Date().getFullYear();
    const before = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM accounts WHERE org_id=$1`, [orgId]);
    const draft = await db.transaction((tx) =>
      createDraft(tx as never, {
        orgId, kind: "TEXT", inputText: "koreksi temuan",
        draft: {
          dateISO: `${year}-06-03`, memo: "koreksi",
          lines: [
            { accountCode: "1191", debitText: "10.000", creditText: "", confidence: 0.45, reason: "x" },
            { accountCode: "1110", debitText: "", creditText: "10.000", confidence: 1.0, reason: "x" },
          ],
          overallConfidence: 0.7, explanation: "koreksi temuan",
          accountProposals: [
            {
              code: "1191", name: "Akun 1191", type: "ASET", normal: "D",
              parentCode: "1100", reason: "masih placeholder",
            },
          ],
        },
        model: "doctor-sak",
      }));
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    const res = await mod.acceptDraftAction(draft.id, {
      dateISO: `${year}-06-03`, memo: "koreksi",
      lines: [
        { accountId: byCode["5200"], debitText: "10.000", creditText: "" },
        { accountId: byCode["1110"], debitText: "", creditText: "10.000" },
      ],
    });
    expect(res.ok).toBe(true);
    const after = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM accounts WHERE org_id=$1`, [orgId]);
    expect(Number(after.rows[0].n)).toBe(Number(before.rows[0].n));
    const ghost = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM accounts WHERE org_id=$1 AND code='1191'`, [orgId]);
    expect(Number(ghost.rows[0].n)).toBe(0);
  });

  it("acceptDraftAction creates proposed accounts then posts atomically", async () => {
    const { db } = await import("@/server/db");
    const { createDraft } = await import("@/server/db/repos/drafts.repo");
    const mod = await import("@/server/actions/ai.actions");
    const year = new Date().getFullYear();
    const draft = await db.transaction((tx) =>
      createDraft(tx as never, {
        orgId, kind: "TEXT", inputText: "koreksi temuan",
        draft: {
          dateISO: `${year}-06-02`, memo: "koreksi",
          lines: [
            { accountCode: "1190", debitText: "10.000", creditText: "", confidence: 0.45, reason: "x" },
            { accountCode: "1110", debitText: "", creditText: "10.000", confidence: 1.0, reason: "x" },
          ],
          overallConfidence: 0.7, explanation: "koreksi temuan",
          accountProposals: [
            {
              code: "1190", name: "Uang Muka", type: "ASET", normal: "D",
              parentCode: "1100", reason: "penampung",
            },
          ],
        },
        model: "doctor-sak",
      }));
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    const res = await mod.acceptDraftAction(draft.id, {
      dateISO: `${year}-06-02`, memo: "koreksi",
      lines: [
        { accountId: "", debitText: "10.000", creditText: "" },
        { accountId: byCode["1110"], debitText: "", creditText: "10.000" },
      ],
    });
    expect(res.ok).toBe(true);
    const acc = await admin.query<{ id: string; name: string; parent_code: string | null }>(
      `SELECT id, name, parent_code FROM accounts WHERE org_id=$1 AND code='1190'`, [orgId]);
    expect(acc.rows).toHaveLength(1);
    expect(acc.rows[0].name).toBe("Uang Muka");
    expect(acc.rows[0].parent_code).toBe("1100");
    const jl = await admin.query<{ account_id: string }>(
      `SELECT l.account_id FROM journal_lines l
         JOIN journal_entries e ON e.id = l.entry_id
         JOIN ai_drafts d ON d.posted_entry_id = e.id
        WHERE d.id=$1 ORDER BY l.position`, [draft.id]);
    expect(jl.rows).toHaveLength(2);
    expect(jl.rows[0].account_id).toBe(acc.rows[0].id);
    expect(jl.rows[1].account_id).toBe(byCode["1110"]);
  });
});
