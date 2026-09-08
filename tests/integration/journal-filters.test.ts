import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("journal filters for AI aggregation tools", () => {
  let orgId: string;
  let kas = "", transport = "", gaji = "";
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Filter Uji")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    kas = byCode["1110"]; transport = byCode["5500"]; gaji = byCode["5200"];
  });
  afterAll(async () => { await admin.end(); await truncateAll(); });

  async function post(dateISO: string, memo: string, expenseId: string, amount: bigint) {
    const { postJournalEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    return db.transaction((tx) =>
      postJournalEntry(tx as never, orgId, "tester@test.id", {
        dateISO, memo,
        lines: [
          { accountId: expenseId, debitMinor: amount, creditMinor: 0n },
          { accountId: kas, debitMinor: 0n, creditMinor: amount },
        ],
      } as never));
  }

  const year = new Date().getFullYear();
  const aug1 = `${year}-08-01`, aug31 = `${year}-08-31`;

  it("setup: posts bensin x2 in Aug, bensin x1 in Jul, gaji x1 in Aug", async () => {
    await post(`${year}-08-05`, "Beli bensin pertalite", transport, 150_000n);
    await post(`${year}-08-20`, "Beli bensin pertamax", transport, 200_000n);
    await post(`${year}-07-11`, "Beli bensin", transport, 100_000n);
    await post(`${year}-08-25`, "Gaji karyawan", gaji, 5_000_000n);
  });

  it("listEntriesWithLinesFiltered: account + month range (berapa bensin bulan Agustus)", async () => {
    const { listEntriesWithLinesFiltered } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    const rows = await db.transaction((tx) =>
      listEntriesWithLinesFiltered(tx as never, orgId, {
        accountCode: "5500", dateFrom: aug1, dateTo: aug31, status: "POSTED",
      }));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.memo).sort()).toEqual(["Beli bensin pertalite", "Beli bensin pertamax"].sort());
  });

  it("listEntriesWithLinesFiltered: unknown account returns [] without SQL error", async () => {
    const { listEntriesWithLinesFiltered } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    const rows = await db.transaction((tx) =>
      listEntriesWithLinesFiltered(tx as never, orgId, { accountCode: "9-9999" }));
    expect(rows).toHaveLength(0);
  });

  it("searchJournals respects date range", async () => {
    const { searchJournals } = await import("@/server/db/repos/search.repo");
    const { db } = await import("@/server/db");
    const all = await db.transaction((tx) => searchJournals(tx as never, orgId, "bensin", 10));
    expect(all).toHaveLength(3);
    const augOnly = await db.transaction((tx) =>
      searchJournals(tx as never, orgId, "bensin", 10, { dateFrom: aug1, dateTo: aug31 }));
    expect(augOnly).toHaveLength(2);
  });

  it("listAccounts filters by keyword (bensin -> transport account)", async () => {
    const { listAccounts } = await import("@/server/db/repos/accounts.repo");
    const { db } = await import("@/server/db");
    const all = await listAccounts(db as never, orgId);
    expect(all.length).toBeGreaterThan(5);
    const hit = await listAccounts(db as never, orgId, "transport");
    expect(hit.map((a) => a.code)).toContain("5500");
    const miss = await listAccounts(db as never, orgId, "zz-tidak-ada");
    expect(miss).toHaveLength(0);
  });
});
