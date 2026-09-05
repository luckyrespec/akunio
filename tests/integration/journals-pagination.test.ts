import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("jurnal pagination & search", () => {
  let orgId: string;
  let kas = "", pendapatan = "";
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const year = new Date().getFullYear();

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Paginasi")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    kas = byCode["1110"]; pendapatan = byCode["4100"];

    const { postJournalEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    const memos = ["Jual tunai kopi", "Jual tunai teh", "Beli gula pasir", "Bayar listrik", "Jual tunai roti"];
    for (let i = 0; i < memos.length; i++) {
      await db.transaction((tx) =>
        postJournalEntry(tx as never, orgId, "tester@test.id", {
          dateISO: `${year}-01-${String(10 + i).padStart(2, "0")}`,
          memo: memos[i],
          lines: [
            { accountId: kas, debitMinor: 100_000n, creditMinor: 0n },
            { accountId: pendapatan, debitMinor: 0n, creditMinor: 100_000n },
          ],
        } as never));
    }
  });
  afterAll(async () => { await admin.end(); await truncateAll(); });

  it("countEntries menghitung total entri", async () => {
    const { countEntries } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    expect(await countEntries(db, orgId)).toBe(5);
  });

  it("listEntriesWithLines mendukung limit + offset per halaman", async () => {
    const { listEntriesWithLines } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    const p1 = await listEntriesWithLines(db, orgId, 2, 0);
    const p2 = await listEntriesWithLines(db, orgId, 2, 2);
    const p3 = await listEntriesWithLines(db, orgId, 2, 4);
    expect(p1).toHaveLength(2);
    expect(p2).toHaveLength(2);
    expect(p3).toHaveLength(1);
    expect(p1[0]?.lines.length).toBeGreaterThan(0);
    const ids = [...p1, ...p2, ...p3].map((e) => e.id).sort();
    expect(new Set(ids).size).toBe(5);
  });

  it("searchEntriesWithLines menemukan berdasar memo/nomor/akun + count", async () => {
    const { searchEntriesWithLines, countSearchEntries } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    const byMemo = await searchEntriesWithLines(db, orgId, "kopi", 10, 0);
    expect(byMemo).toHaveLength(1);
    expect(byMemo[0]?.memo).toMatch(/kopi/i);
    expect(await countSearchEntries(db, orgId, "kopi")).toBe(1);

    const byAccount = await searchEntriesWithLines(db, orgId, "1110", 10, 0);
    expect(byAccount.length).toBeGreaterThanOrEqual(1);

    const miss = await searchEntriesWithLines(db, orgId, "zzzz-tidak-ada", 10, 0);
    expect(miss).toHaveLength(0);
    expect(await countSearchEntries(db, orgId, "zzzz-tidak-ada")).toBe(0);
  });
});
