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

// D3: kartu index == halaman detail (kumulatif Through) + drilldown neto +
// kas dasbor posisi hari ini. Komposisi tiap `it` memakai builder yang SAMA
// dengan halaman produksi (postedLinesBetween/Through → aggregateFromLines +
// reportMetaMap → buildSakEmkm*), dengan argumen setara — tanpa duplikasi
// logika halaman di test.
async function ensureMonthPeriod(admin: Pool, orgId: string, ym: string): Promise<void> {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  await admin.query(
    `INSERT INTO fiscal_periods (org_id, name, starts_on, ends_on, status)
     VALUES ($1, $2, $3, $4, 'OPEN') ON CONFLICT DO NOTHING`,
    [orgId, ym, `${ym}-01`, `${ym}-${pad(lastDay)}`],
  );
}

// D3a: kartu neraca/ekuitas/kas di index harus kumulatif (Through akhir
// tahun) seperti halaman neraca — bukan YTD Between yang menghilangkan
// saldo tahun lalu (kas 2jt tahun lalu + 500rb tahun berjalan = 2,5jt,
// bukan 500rb).
describe.skipIf(process.env.SKIP_DB_TESTS === "1")("kartu index kumulatif samakan halaman neraca", () => {
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
    orgId = (await makeOrg("PT Kartu Kumulatif")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    // Seed hanya menanam periode tahun berjalan — sediakan Des tahun lalu.
    await ensureMonthPeriod(admin, orgId, `${year - 1}-12`);

    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    for (const r of rows.rows) byCode.set(r.code, r.id);
    const id = (code: string): string => {
      const v = byCode.get(code);
      if (!v) throw new Error(`AKUN_UJI_HILANG: ${code}`);
      return v;
    };

    // Modal awal 2jt tunai tahun lalu
    await post({
      dateISO: `${year - 1}-12-10`, memo: "Modal awal tunai",
      lines: [
        { accountId: id("1110"), debitMinor: 2_000_000n, creditMinor: 0n },
        { accountId: id("3100"), debitMinor: 0n, creditMinor: 2_000_000n },
      ],
    });
    // Jual tunai 500rb tahun berjalan
    await post({
      dateISO: `${year}-03-10`, memo: "Jual tunai",
      lines: [
        { accountId: id("1110"), debitMinor: 500_000n, creditMinor: 0n },
        { accountId: id("4100"), debitMinor: 0n, creditMinor: 500_000n },
      ],
    });
  });
  afterAll(async () => { await admin.end(); await truncateAll(); });

  it("neraca index kumulatif samakan halaman neraca", async () => {
    const { db } = await import("@/server/db");
    const { accounts } = await import("@/server/db/schema/org");
    const { reportMetaMap } = await import("@/server/db/repos/accounts.repo");
    const { aggregateFromLines, signed } = await import("@/core/reports/aggregates");
    const { buildSakEmkmBalanceSheet, buildSakEmkmIncomeStatement } =
      await import("@/core/reports/sak-emkm");
    const { postedLinesBetween, postedLinesThrough } =
      await import("@/server/reports/build");

    const accRows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
    const metas = reportMetaMap(accRows);
    const cashOf = (lines: { accountId: string; debitMinor: bigint; creditMinor: bigint }[]) =>
      aggregateFromLines(lines, metas)
        .filter((a) => a.meta.isCash || a.meta.isBank)
        .reduce((s, a) => s + signed(a.meta, a), 0n);

    // Komposisi kartu index — argumen setara src/app/(app)/laporan/page.tsx
    // (kumulatif Through akhir tahun, == halaman detail).
    const indexLines = await db.transaction((tx) =>
      postedLinesThrough(tx as never, orgId, `${year}-12-31`));
    const indexAggs = aggregateFromLines(indexLines, metas);
    const indexCards = {
      totalAssets: buildSakEmkmBalanceSheet(
        indexAggs, buildSakEmkmIncomeStatement(indexAggs).netIncomeMinor).totalAssetsMinor,
      totalEquity: buildSakEmkmBalanceSheet(
        indexAggs, buildSakEmkmIncomeStatement(indexAggs).netIncomeMinor).totalEquityMinor,
      cashPosition: cashOf(indexLines),
    };

    // Komposisi halaman detail — argumen setara neraca/page.tsx (Through endsOn).
    const detailLines = await db.transaction((tx) =>
      postedLinesThrough(tx as never, orgId, `${year}-12-31`));
    const detailAggs = aggregateFromLines(detailLines, metas);
    const detailBS = buildSakEmkmBalanceSheet(
      detailAggs, buildSakEmkmIncomeStatement(detailAggs).netIncomeMinor);

    expect(detailBS.totalAssetsMinor).toBe(2_500_000n);
    expect(indexCards.totalAssets).toBe(2_500_000n); // bukan 500_000n
    expect(indexCards.totalAssets).toBe(detailBS.totalAssetsMinor);
    expect(indexCards.totalEquity).toBe(detailBS.totalEquityMinor);
    expect(indexCards.cashPosition).toBe(cashOf(detailLines));
  });
});

// D3b: drilldown per akun beban harus NETO bertanda (D−K, hormat kontra D1)
// sehingga sama dengan total beban L/R — bukan bruto per sisi yang
// menghitung koreksi kredit sebagai penambah (1jt + 200rb = 1,2jt, salah).
describe.skipIf(process.env.SKIP_DB_TESTS === "1")("drilldown beban neto samakan L/R", () => {
  let orgId: string;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const byCode = new Map<string, string>();
  const year = new Date().getFullYear();
  const period = `${year}-06`;

  async function post(input: object) {
    const { postJournalEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    return db.transaction((tx) =>
      postJournalEntry(tx as never, orgId, "tester@test.id", input as never));
  }

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Drilldown Neto")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);

    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    for (const r of rows.rows) byCode.set(r.code, r.id);
    const id = (code: string): string => {
      const v = byCode.get(code);
      if (!v) throw new Error(`AKUN_UJI_HILANG: ${code}`);
      return v;
    };

    // Beban 1jt tunai
    await post({
      dateISO: `${period}-10`, memo: "Beban operasional",
      lines: [
        { accountId: id("5600"), debitMinor: 1_000_000n, creditMinor: 0n },
        { accountId: id("1110"), debitMinor: 0n, creditMinor: 1_000_000n },
      ],
    });
    // Koreksi 200rb (kredit ke akun beban)
    await post({
      dateISO: `${period}-11`, memo: "Koreksi beban",
      lines: [
        { accountId: id("1110"), debitMinor: 200_000n, creditMinor: 0n },
        { accountId: id("5600"), debitMinor: 0n, creditMinor: 200_000n },
      ],
    });
  });
  afterAll(async () => { await admin.end(); await truncateAll(); });

  it("drilldown beban == total beban L/R", async () => {
    const { drilldownAccountDetails } = await import("@/server/reports/drilldown");
    const { db } = await import("@/server/db");
    const { accounts } = await import("@/server/db/schema/org");
    const { reportMetaMap } = await import("@/server/db/repos/accounts.repo");
    const { aggregateFromLines } = await import("@/core/reports/aggregates");
    const { buildSakEmkmIncomeStatement } = await import("@/core/reports/sak-emkm");
    const { postedLinesBetween } = await import("@/server/reports/build");
    const { Money } = await import("@/core/money/money");

    const drill = await drilldownAccountDetails(orgId, "5600", period);
    const drillTotal = drill.items.reduce((s, i) => s + BigInt(i.amountMinor), 0n);

    // Total statement — builder + argumen setara laba-rugi/page.tsx (Between sebulan).
    const accRows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
    const lines = await db.transaction((tx) =>
      postedLinesBetween(tx as never, orgId, `${period}-01`, `${period}-30`));
    const statementTotal = buildSakEmkmIncomeStatement(
      aggregateFromLines(lines, reportMetaMap(accRows))).totalOperatingExpenseMinor;

    expect(statementTotal).toBe(800_000n);
    expect(drill.currentPeriodTotal).toBe(Money.fromMinor(statementTotal).formatIdr());
    expect(drillTotal).toBe(statementTotal); // bukan 1_200_000n
  });
});

// D3c: kas dasbor = posisi kumulatif hari ini (Through todayISO, helper yang
// dipakai dasbor/page.tsx) — jurnal bertanggal masa depan belum terjadi dan
// tak boleh ikut; aktivitas terakhir hanya jurnal POSTED (draf dikecualikan).
describe.skipIf(process.env.SKIP_DB_TESTS === "1")("kas dasbor posisi hari ini + aktivitas POSTED", () => {
  let orgId: string;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const byCode = new Map<string, string>();
  let past = "";
  let future = "";
  let endISO = "";
  let postedId1 = "";
  let postedId2 = "";
  let draftJournalId = "";

  async function post(input: object) {
    const { postJournalEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    return db.transaction((tx) =>
      postJournalEntry(tx as never, orgId, "tester@test.id", input as never));
  }

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Dasbor Today")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);

    const { todayISO } = await import("@/lib/date");
    const today = todayISO();
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const toISODate = (d: Date) =>
      `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    past = toISODate(new Date(Date.now() - 30 * 86_400_000));
    future = toISODate(new Date(Date.now() + 7 * 86_400_000));
    if (future.slice(0, 4) !== today.slice(0, 4)) {
      // Tepi tahun: tak ada "7 hari lagi" di tahun berjalan.
      future = `${today.slice(0, 4)}-12-31`;
      if (!(future > today)) future = `${Number(today.slice(0, 4)) + 1}-01-07`;
    }
    endISO = `${future.slice(0, 4)}-12-31`;
    await ensureMonthPeriod(admin, orgId, past.slice(0, 7));
    await ensureMonthPeriod(admin, orgId, future.slice(0, 7));

    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    for (const r of rows.rows) byCode.set(r.code, r.id);
    const id = (code: string): string => {
      const v = byCode.get(code);
      if (!v) throw new Error(`AKUN_UJI_HILANG: ${code}`);
      return v;
    };

    // Sudah terjadi 1jt
    postedId1 = (await post({
      dateISO: past, memo: "Jual tunai",
      lines: [
        { accountId: id("1110"), debitMinor: 1_000_000n, creditMinor: 0n },
        { accountId: id("4100"), debitMinor: 0n, creditMinor: 1_000_000n },
      ],
    })).id;
    // Masa depan 777rb — belum terjadi hari ini
    postedId2 = (await post({
      dateISO: future, memo: "Jual masa depan",
      lines: [
        { accountId: id("1110"), debitMinor: 777_000n, creditMinor: 0n },
        { accountId: id("4100"), debitMinor: 0n, creditMinor: 777_000n },
      ],
    })).id;
    // Draf kas 999rb — bukan aktivitas POSTED
    const { withOrg } = await import("@/server/db/repos/with-org");
    const { createCashEntryRepo } = await import("@/server/db/repos/cash-bank.repo");
    draftJournalId = (await withOrg(orgId, (tx) =>
      createCashEntryRepo(tx as never, orgId, "tester@test.id", {
        kind: "TERIMA",
        entryDate: past,
        cashAccountId: id("1110"),
        counterAccountId: id("4100"),
        amountMinor: 999_000n,
        memo: "Uji dasbor DRAFT",
      }, { post: false }))).journalEntryId;
  });
  afterAll(async () => { await admin.end(); await truncateAll(); });

  it("kas dasbor posisi hari ini + aktivitas POSTED", async () => {
    const { todayISO } = await import("@/lib/date");
    const { db } = await import("@/server/db");
    const { accounts } = await import("@/server/db/schema/org");
    const { reportMetaMap } = await import("@/server/db/repos/accounts.repo");
    const { aggregateFromLines, signed } = await import("@/core/reports/aggregates");
    const { postedLinesThrough } = await import("@/server/reports/build");
    const { listEntriesWithLinesFiltered } =
      await import("@/server/db/repos/journals.repo");

    const today = todayISO();
    const accRows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
    const metas = reportMetaMap(accRows);
    const cashOf = async (through: string) => {
      const lines = await db.transaction((tx) =>
        postedLinesThrough(tx as never, orgId, through));
      return aggregateFromLines(lines, metas)
        .filter((a) => a.meta.isCash || a.meta.isBank)
        .reduce((s, a) => s + signed(a.meta, a), 0n);
    };

    expect(past < today).toBe(true);
    expect(today < future).toBe(true);
    expect(await cashOf(today)).toBe(1_000_000n); // bukan 1_777_000n
    expect(await cashOf(endISO)).toBe(1_777_000n);

    // Aktivitas — helper berfilter POSTED seperti dasbor/page.tsx pasca-fix.
    const activity = await listEntriesWithLinesFiltered(
      db as never, orgId, { status: "POSTED" }, 10);
    const activityIds = activity.map((e) => e.id);
    expect(activityIds).toContain(postedId1);
    expect(activityIds).toContain(postedId2);
    expect(activityIds).not.toContain(draftJournalId);
  });
});
