import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("ledger range drilldown", () => {
  let orgId: string;
  let kas = "", beban = "";
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const year = new Date().getFullYear();

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Kartu Beban")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    kas = byCode["1110"];
    beban = byCode["5200"] ?? rows.rows.find((r) => r.code.startsWith("52"))?.id;
    if (!kas || !beban) throw new Error("COA seed tidak lengkap untuk test");

    await post({ dateISO: `${year}-01-10`, memo: "Gaji Januari", minor: 300_000n });
    await post({ dateISO: `${year}-02-20`, memo: "Gaji Februari", minor: 200_000n });
    await post({ dateISO: `${year}-03-05`, memo: "Gaji Maret", minor: 100_000n });
  });
  afterAll(async () => { await admin.end(); await truncateAll(); });

  async function post(input: { dateISO: string; memo: string; minor: bigint }) {
    const { postJournalEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    return db.transaction((tx) =>
      postJournalEntry(tx as never, orgId, "tester@test.id", {
        dateISO: input.dateISO,
        memo: input.memo,
        lines: [
          { accountId: beban, debitMinor: input.minor, creditMinor: 0n },
          { accountId: kas, debitMinor: 0n, creditMinor: input.minor },
        ],
      } as never));
  }

  async function ledgerRange(from?: string, to?: string) {
    const { getLedger } = await import("@/server/db/repos/ledger.repo");
    const { db } = await import("@/server/db");
    return db.transaction((tx) =>
      getLedger(tx as never, orgId, beban, from || to ? { from, to } : undefined));
  }

  it("menghitung saldo awal dan hanya baris dalam rentang", async () => {
    const { openingMinor, rows } = await ledgerRange(`${year}-03-01`, `${year}-03-31`);
    expect(openingMinor).toBe(500_000n);
    expect(rows).toHaveLength(1);
    expect(rows[0].debitMinor).toBe(100_000n);
    expect(rows[0].balanceMinor).toBe(600_000n);

    const entry = await admin.query<{ id: string }>(
      `SELECT id FROM journal_entries WHERE org_id=$1 AND number=$2`, [orgId, rows[0].number]);
    expect(rows[0].entryId).toBe(entry.rows[0].id);
  });

  it("rentang penuh sama dengan akumulasi semua mutasi", async () => {
    const { openingMinor, rows } = await ledgerRange(`${year}-01-01`, `${year}-03-31`);
    expect(openingMinor).toBe(0n);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.balanceMinor)).toEqual([300_000n, 500_000n, 600_000n]);
  });

  it("rentang tanpa mutasi tetap membawa saldo awal", async () => {
    const { openingMinor, rows } = await ledgerRange(`${year}-04-01`, `${year}-04-30`);
    expect(openingMinor).toBe(600_000n);
    expect(rows).toHaveLength(0);
  });

  it("tanpa rentang tetap all-time dengan opening nol", async () => {
    const { openingMinor, rows } = await ledgerRange();
    expect(openingMinor).toBe(0n);
    expect(rows).toHaveLength(3);
  });
});
