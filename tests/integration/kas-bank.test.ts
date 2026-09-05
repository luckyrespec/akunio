import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("kas-bank repo", () => {
  let orgId: string;
  let kas = "",
    bank = "",
    beban = "",
    pendapatan = "";
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Kas Bank")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`,
      [orgId]
    );
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    kas = byCode["1110"];
    bank = byCode["1120"];
    beban = byCode["5900"];
    pendapatan = byCode["4100"];
  });
  afterAll(async () => {
    await admin.end();
    await truncateAll();
  });

  const year = new Date().getFullYear();

  it("bayar beban langsung POSTED dan jurnal seimbang", async () => {
    const { withOrg } = await import("@/server/db/repos/with-org");
    const { createCashEntryRepo, listCashEntriesRepo } = await import(
      "@/server/db/repos/cash-bank.repo"
    );
    const out = await withOrg(orgId, (tx) =>
      createCashEntryRepo(
        tx as never,
        orgId,
        "t@t.id",
        {
          kind: "BAYAR",
          entryDate: `${year}-02-01`,
          cashAccountId: kas,
          counterAccountId: beban,
          amountMinor: 150_000n,
          memo: "ATK",
        },
        { post: true }
      )
    );
    expect(out.number).toBe(`BBK-${year}-0001`);
    const list = await withOrg(orgId, (tx) =>
      listCashEntriesRepo(tx as never, orgId, "BAYAR")
    );
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe("POSTED");
    const { getEntryWithLines } = await import(
      "@/server/db/repos/journals.repo"
    );
    const { db } = await import("@/server/db");
    const je = await db.transaction((tx) =>
      getEntryWithLines(tx as never, orgId, out.journalEntryId)
    );
    expect(je!.lines).toHaveLength(2);
    expect(je!.lines[0].debitMinor).toBe(150_000n);
    expect(je!.lines[1].creditMinor).toBe(150_000n);
  });

  it("draft terima lalu posting terpisah", async () => {
    const { withOrg } = await import("@/server/db/repos/with-org");
    const { createCashEntryRepo, postCashDraftRepo } = await import(
      "@/server/db/repos/cash-bank.repo"
    );
    const out = await withOrg(orgId, (tx) =>
      createCashEntryRepo(
        tx as never,
        orgId,
        "t@t.id",
        {
          kind: "TERIMA",
          entryDate: `${year}-02-02`,
          cashAccountId: bank,
          counterAccountId: pendapatan,
          amountMinor: 2_000_000n,
          memo: "Jasa",
        },
        { post: false }
      )
    );
    expect(out.number).toBe(`BBM-${year}-0001`);
    const posted = await withOrg(orgId, (tx) =>
      postCashDraftRepo(tx as never, orgId, "t@t.id", out.id)
    );
    expect(posted.number).toBe(`BBM-${year}-0001`);
  });

  it("transfer menolak akun sama", async () => {
    const { withOrg } = await import("@/server/db/repos/with-org");
    const { createCashEntryRepo } = await import(
      "@/server/db/repos/cash-bank.repo"
    );
    await expect(
      withOrg(orgId, (tx) =>
        createCashEntryRepo(
          tx as never,
          orgId,
          "t@t.id",
          {
            kind: "TRANSFER",
            entryDate: `${year}-02-03`,
            cashAccountId: kas,
            counterAccountId: kas,
            amountMinor: 500_000n,
            memo: "x",
          },
          { post: true }
        )
      )
    ).rejects.toThrow("AKUN_SAMA");
  });

  it("histori menghitung saldo berjalan kas", async () => {
    const { withOrg } = await import("@/server/db/repos/with-org");
    const { getCashHistoryRepo } = await import(
      "@/server/db/repos/cash-bank.repo"
    );
    const h = await withOrg(orgId, (tx) =>
      getCashHistoryRepo(tx as never, orgId, kas, `${year}-01-01`, `${year}-12-31`)
    );
    const last = h.rows[h.rows.length - 1];
    expect(last.balanceMinor).toBe(-150_000n);
  });
});
