import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { makeOrg, truncateAll } from "./helpers";

// D1: akun kontra (retur/akumulasi/prive) harus MENGURANGI di laporan,
// bukan menambah. Komposisi builder persis seperti halaman produksi:
// postedLinesBetween (@/server/reports/build) → aggregateFromLines +
// reportMetaMap → incomeStatement / buildSakEmkm*.
//
// CATATAN verifikasi COA (pelajaran B6): seedOrgData hanya menanam COA
// dasar — 4110/4120 TIDAK ADA di sana (hanya di ekstra DAGANG), dan 1500
// adalah akun GRUP (punya anak 1590) sehingga tak bisa diposting
// (guard GROUP_ACCOUNT). Substitusi ekuivalen leaf postable:
// - jual 1jt → 4100 Pendapatan Usaha (PENDAPATAN/K, leaf di COA dasar)
// - retur 200rb → 4120 buatan-test (PENDAPATAN/D/contra, induk 4000 agar
//   4100 tetap leaf postable)
// - beli aset 5jt → 1510 buatan-test (ASET/D, induk 1500)
// - susut 500rb → 1590 (ASET/K/contra, bawaan seed) × 5600
// - prive 100rb → 3300 (EKUITAS/D/contra, bawaan seed)
describe.skipIf(process.env.SKIP_DB_TESTS === "1")("laporan SAK: akun kontra mengurangi", () => {
  let orgId: string;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const byCode = new Map<string, string>();
  const year = new Date().getFullYear();

  async function post(input: object) {
    const { postJournalEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    return db.transaction((tx) =>
      postJournalEntry(tx as never, orgId, "tester@test.id", input as never));
  }

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Kontra")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);

    const { db } = await import("@/server/db");
    const { createAccount } = await import("@/server/db/repos/accounts.repo");
    await db.transaction((tx) =>
      createAccount(tx as never, {
        orgId, code: "4120", name: "Retur & Potongan Penjualan",
        type: "PENDAPATAN", normal: "D", parentCode: "4000", contra: true,
      }));
    await db.transaction((tx) =>
      createAccount(tx as never, {
        orgId, code: "1510", name: "Peralatan Kantor",
        type: "ASET", normal: "D", parentCode: "1500",
      }));

    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    for (const r of rows.rows) byCode.set(r.code, r.id);
    const id = (code: string): string => {
      const v = byCode.get(code);
      if (!v) throw new Error(`AKUN_UJI_HILANG: ${code}`);
      return v;
    };

    // Jual tunai 1jt
    await post({
      dateISO: `${year}-06-10`, memo: "Jual tunai",
      lines: [
        { accountId: id("1110"), debitMinor: 1_000_000n, creditMinor: 0n },
        { accountId: id("4100"), debitMinor: 0n, creditMinor: 1_000_000n },
      ],
    });
    // Retur 200rb (kas kembali)
    await post({
      dateISO: `${year}-06-11`, memo: "Retur penjualan",
      lines: [
        { accountId: id("4120"), debitMinor: 200_000n, creditMinor: 0n },
        { accountId: id("1110"), debitMinor: 0n, creditMinor: 200_000n },
      ],
    });
    // Beli peralatan 5jt tunai
    await post({
      dateISO: `${year}-06-12`, memo: "Beli peralatan",
      lines: [
        { accountId: id("1510"), debitMinor: 5_000_000n, creditMinor: 0n },
        { accountId: id("1110"), debitMinor: 0n, creditMinor: 5_000_000n },
      ],
    });
    // Susut 500rb
    await post({
      dateISO: `${year}-06-13`, memo: "Penyusutan peralatan",
      lines: [
        { accountId: id("5600"), debitMinor: 500_000n, creditMinor: 0n },
        { accountId: id("1590"), debitMinor: 0n, creditMinor: 500_000n },
      ],
    });
    // Prive 100rb
    await post({
      dateISO: `${year}-06-14`, memo: "Prive pemilik",
      lines: [
        { accountId: id("3300"), debitMinor: 100_000n, creditMinor: 0n },
        { accountId: id("1110"), debitMinor: 0n, creditMinor: 100_000n },
      ],
    });
  });
  afterAll(async () => { await admin.end(); await truncateAll(); });

  it("retur, akumulasi, prive mengurangi (bukan menambah)", async () => {
    const { db } = await import("@/server/db");
    const { accounts } = await import("@/server/db/schema/org");
    const { reportMetaMap } = await import("@/server/db/repos/accounts.repo");
    const { aggregateFromLines } = await import("@/core/reports/aggregates");
    const { incomeStatement, movementByCode } = await import("@/core/reports/statements");
    const { buildSakEmkmIncomeStatement, buildSakEmkmBalanceSheet } =
      await import("@/core/reports/sak-emkm");
    const { postedLinesBetween } = await import("@/server/reports/build");

    const accRows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));

    // Guard: flag kontra + normal sesuai asumsi skenario.
    const flag = (code: string): string => {
      const a = accRows.find((r) => r.code === code);
      return `${a?.normal}/${a?.contra === true ? "contra" : "biasa"}`;
    };
    expect(flag("4120")).toBe("D/contra");
    expect(flag("1590")).toBe("K/contra");
    expect(flag("3300")).toBe("D/contra");

    const lines = await db.transaction((tx) =>
      postedLinesBetween(tx as never, orgId, `${year}-01-01`, `${year}-12-31`));
    const aggs = aggregateFromLines(lines, reportMetaMap(accRows));

    const revenueNet = incomeStatement(aggs).revenueTotalMinor;
    const sakIS = buildSakEmkmIncomeStatement(aggs);
    const sakBS = buildSakEmkmBalanceSheet(aggs, sakIS.netIncomeMinor);
    const equityBeforeIncome = sakBS.equityRows
      .filter((r) => r.code !== "3999")
      .reduce((s, r) => s + r.movementMinor, 0n);

    expect(revenueNet).toBe(800_000n); // bukan 1_200_000n
    expect(sakIS.totalRevenueMinor).toBe(800_000n); // bukan 1_200_000n
    expect(sakBS.totalFixedAssetsMinor).toBe(4_500_000n); // bukan 5_500_000n
    expect(equityBeforeIncome).toBe(-100_000n); // bukan +100_000n
    expect(movementByCode(aggs, "3300")).toBe(-100_000n);
  });
});

// D2: draf kas (status DRAFT) harus diabaikan rekonsiliasi — saldo buku +
// kandidat match hanya status='POSTED'. Tanpa filter POSTED, saldo buku
// ikut menghitung draf (1_099_000n) dan draf muncul di unmatched.
describe.skipIf(process.env.SKIP_DB_TESTS === "1")("rekonsiliasi POSTED-only", () => {
  let orgId: string;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  let kas = "",
    pendapatan = "";
  const year = new Date().getFullYear();
  const statementDate = `${year}-05-31`;

  async function postCash(amountMinor: bigint) {
    const { withOrg } = await import("@/server/db/repos/with-org");
    const { createCashEntryRepo } = await import(
      "@/server/db/repos/cash-bank.repo"
    );
    return withOrg(orgId, (tx) =>
      createCashEntryRepo(
        tx as never,
        orgId,
        "tester@test.id",
        {
          kind: "TERIMA",
          entryDate: `${year}-05-01`,
          cashAccountId: kas,
          counterAccountId: pendapatan,
          amountMinor,
          memo: "Uji rekonsiliasi POSTED",
        },
        { post: true }
      )
    );
  }

  async function draftCash(amountMinor: bigint) {
    const { withOrg } = await import("@/server/db/repos/with-org");
    const { createCashEntryRepo } = await import(
      "@/server/db/repos/cash-bank.repo"
    );
    return withOrg(orgId, (tx) =>
      createCashEntryRepo(
        tx as never,
        orgId,
        "tester@test.id",
        {
          kind: "TERIMA",
          entryDate: `${year}-05-02`,
          cashAccountId: kas,
          counterAccountId: pendapatan,
          amountMinor,
          memo: "Uji rekonsiliasi DRAFT",
        },
        { post: false }
      )
    );
  }

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Rekonsiliasi Posted")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`,
      [orgId]
    );
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    kas = byCode["1110"];
    pendapatan = byCode["4100"];
  });
  afterAll(async () => {
    await admin.end();
    await truncateAll();
  });

  it("draf kas diabaikan rekonsiliasi", async () => {
    const posted = await postCash(100_000n);
    const draft = await draftCash(999_000n);
    const { db } = await import("@/server/db");
    const {
      createReconciliationRepo,
      getUnmatchedLedgerLinesRepo,
    } = await import("@/server/db/repos/reconciliation.repo");
    const rec = await createReconciliationRepo(db as never, orgId, {
      bankAccountId: kas,
      statementDate,
      statementBalanceMinor: 100_000n,
    });
    expect(rec.ledgerBalanceMinor).toBe(100_000n);
    const unmatched = await getUnmatchedLedgerLinesRepo(
      db as never,
      orgId,
      kas,
      statementDate
    );
    const entryIds = unmatched.map((l) => l.entryId);
    expect(entryIds).toContain(posted.journalEntryId);
    expect(entryIds).not.toContain(draft.journalEntryId);
  });
});
