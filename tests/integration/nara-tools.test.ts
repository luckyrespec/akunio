import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { accounts } from "@/server/db/schema/org";
import { eq } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Nara Accounting Tools Execution", () => {
  let orgId: string;
  const actorEmail = "test@test.id";

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Tools Test")).orgId;
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("categorizes tools into safe and mutating sets correctly", async () => {
    const { SAFE_TOOLS, MUTATING_TOOLS } = await import("@/server/ai/nara-tools");
    expect(SAFE_TOOLS.has("list_accounts")).toBe(true);
    expect(SAFE_TOOLS.has("get_report")).toBe(true);
    expect(SAFE_TOOLS.has("get_financial_kpis")).toBe(true);
    expect(MUTATING_TOOLS.has("post_journal")).toBe(true);
    expect(MUTATING_TOOLS.has("create_account")).toBe(true);
    expect(MUTATING_TOOLS.has("create_journal_draft")).toBe(true);
  });

  it("executes safe tool list_accounts without error", async () => {
    const { executeNaraTool } = await import("@/server/ai/nara-tools");
    const res = await executeNaraTool(orgId, actorEmail, "list_accounts", {});
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it("executes mutating tool create_account and validates in DB", async () => {
    const { executeNaraTool } = await import("@/server/ai/nara-tools");
    const { db } = await import("@/server/db");

    const res = await executeNaraTool(orgId, actorEmail, "create_account", {
      code: "6-9999",
      name: "Beban AI Testing",
      type: "EXPENSE",
      normal: "D",
    });
    expect(res.success).toBe(true);

    const [acc] = await db.select().from(accounts).where(eq(accounts.code, "6-9999"));
    expect(acc).toBeDefined();
    expect(acc.name).toBe("Beban AI Testing");
  });

  it("validates double-entry balance in post_journal", async () => {
    const { executeNaraTool } = await import("@/server/ai/nara-tools");
    const res = await executeNaraTool(orgId, actorEmail, "post_journal", {
      memo: "Transaksi Tidak Seimbang",
      dateISO: "2026-09-03",
      lines: [
        { accountCode: "6-9999", debit: "100000", credit: "0" },
        { accountCode: "6-9999", debit: "0", credit: "50000" },
      ],
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/seimbang|balance|VALIDASI_GAGAL/i);
  });

  it("accepts create_journal_draft with '0' empty sides (model output variance)", async () => {
    const { executeNaraTool } = await import("@/server/ai/nara-tools");
    // Bentuk args persis seperti yang dikirim model di screenshot error SETIAP_BARIS_SATU_SISI
    const res = await executeNaraTool(orgId, actorEmail, "create_journal_draft", {
      memo: "Pencatatan aset laptop dari modal disetor",
      dateISO: "2022-07-01",
      explanation: "Pencatatan aset tetap laptop senilai Rp10.000.000",
      overallConfidence: 0.9,
      lines: [
        { accountCode: "1500", debitText: "10000000", creditText: "0", confidence: 0.9, reason: "Penambahan aset tetap" },
        { accountCode: "3100", debitText: "0", creditText: "10000000", confidence: 0.9, reason: "Setoran modal pemilik" },
      ],
    });
    expect(res.success).toBe(true);
    expect((res.data as { draftId?: string }).draftId).toBeDefined();
  });
});
