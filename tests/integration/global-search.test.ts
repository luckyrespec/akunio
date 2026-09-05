import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("global search: nominal & aset", () => {
  let orgId: string;
  let kas = "", pendapatan = "", asetAcc = "", akumAcc = "", bebanAcc = "";
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const year = new Date().getFullYear();

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Cari")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    kas = byCode["1110"]; pendapatan = byCode["4100"];
    asetAcc = Object.entries(byCode).find(([c]) => c.startsWith("15"))?.[1] ?? kas;
    akumAcc = Object.entries(byCode).find(([c]) => c.startsWith("16"))?.[1] ?? kas;
    bebanAcc = Object.entries(byCode).find(([c]) => c.startsWith("6"))?.[1] ?? pendapatan;

    const { postJournalEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    for (const [day, memo, amt] of [
      ["05", "Jual tunai harian", 100_000n],
      ["06", "Jual tunai harian", 250_000n],
    ] as Array<[string, string, bigint]>) {
      await db.transaction((tx) =>
        postJournalEntry(tx as never, orgId, "tester@test.id", {
          dateISO: `${year}-03-${day}`,
          memo,
          lines: [
            { accountId: kas, debitMinor: amt, creditMinor: 0n },
            { accountId: pendapatan, debitMinor: 0n, creditMinor: amt },
          ],
        } as never));
    }

    await admin.query(
      `INSERT INTO fixed_assets
         (org_id, code, name, category, acquisition_date, in_service_date,
          acquisition_cost_minor, useful_life_months, depreciation_method,
          asset_account_id, accumulated_dep_account_id, depreciation_expense_account_id, notes)
       VALUES ($1, 'AST-2026-0001', 'Laptop Kerja', 'INVENTARIS_KANTOR',
               $2, $2, 1000000000, 48, 'STRAIGHT_LINE', $3, $4, $5, 'Untuk desainer baru')`,
      [orgId, `${year}-03-01`, asetAcc, akumAcc, bebanAcc],
    );
  });
  afterAll(async () => { await admin.end(); await truncateAll(); });

  it("searchEntriesByAmount menemukan entri sesuai total", async () => {
    const { searchEntriesByAmount } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    const hit = await searchEntriesByAmount(db, orgId, 250_000n, 10);
    expect(hit).toHaveLength(1);
    expect(hit[0]?.lines.length).toBeGreaterThan(0);
    const miss = await searchEntriesByAmount(db, orgId, 999_00n, 10);
    expect(miss).toHaveLength(0);
  });

  it("searchAssets menemukan berdasar nama/keterangan/nominal", async () => {
    const { searchAssets } = await import("@/server/db/repos/assets.repo");
    const { db } = await import("@/server/db");
    expect((await searchAssets(db, orgId, "laptop", null, 5))).toHaveLength(1);
    expect((await searchAssets(db, orgId, "desainer", null, 5))).toHaveLength(1);
    expect((await searchAssets(db, orgId, "zzz", null, 5))).toHaveLength(0);
    const byAmount = await searchAssets(db, orgId, "zzz", 1_000_000_000n, 5);
    expect(byAmount).toHaveLength(1);
    expect(byAmount[0]?.code).toBe("AST-2026-0001");
  });
});
