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

// D3: kartu index + kas dasbor + aktivitas via helper produksi bersama
// (@/server/reports/cards, dipakai halaman + test) — test memanggil helper
// langsung, bukan memodel ulang jendela query halaman.
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

  it("kartu index == helper produksi (kumulatif, bukan YTD)", async () => {
    const { db } = await import("@/server/db");
    const { getLaporanIndexCards } = await import("@/server/reports/cards");

    // Helper produksi yang SAMA dipakai laporan/page.tsx — tanpa model
    // ulang jendela di test. Data: modal 2jt tahun lalu + jual 500rb
    // tahun berjalan.
    const cards = await db.transaction((tx) =>
      getLaporanIndexCards(tx as never, orgId, year));

    expect(cards.totalAssets).toBe(2_500_000n); // bukan 500_000n
    expect(cards.cashPosition).toBe(2_500_000n); // bukan 500_000n
    expect(cards.totalEquity).toBe(2_500_000n);
    expect(cards.netIncome).toBe(500_000n); // YTD tahun berjalan saja
    expect(cards.isBalanced).toBe(true);
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
    const { getDasborCash, getDasborRecentActivity } =
      await import("@/server/reports/cards");

    const today = todayISO();
    // Helper produksi yang SAMA dipakai dasbor/page.tsx — tanpa model
    // ulang jendela di test.
    const cash = await db.transaction((tx) =>
      getDasborCash(tx as never, orgId, today));

    expect(past < today).toBe(true);
    expect(today < future).toBe(true);
    expect(cash).toBe(1_000_000n); // bukan 1_777_000n (masa depan tak ikut)

    // Aktivitas — helper POSTED-only seperti dasbor/page.tsx pasca-fix.
    const activity = await getDasborRecentActivity(db as never, orgId, 10);
    const activityIds = activity.map((e) => e.id);
    expect(activityIds).toContain(postedId1);
    expect(activityIds).toContain(postedId2);
    expect(activityIds).not.toContain(draftJournalId);
  });
});

// D4: arus kas berkategori — komposisi via helper produksi bersama
// (@/server/reports/cash-flow, dipakai arus-kas/page.tsx + test; pelajaran
// R11 — test memanggil helper yang sama, bukan memodel ulang komposisi
// halaman). Fixture via repo layer (postJournalEntry/createAccount):
// operasi + investasi + bayar utang pendek + bayar pajak + amortisasi dimuka.
// Residu material = >1% delta kas (abs) → temuan Doctor.
describe.skipIf(process.env.SKIP_DB_TESTS === "1")("arus kas tanpa plug pada fixture lengkap", () => {
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
    orgId = (await makeOrg("PT Arus Kas")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);

    const { db } = await import("@/server/db");
    const { createAccount } = await import("@/server/db/repos/accounts.repo");
    // 1500 Peralatan adalah akun GRUP (anak 1590) — seperti D1, tanam leaf
    // postable 1510 untuk belanja modal.
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

    // Operasi: jual tunai 1jt
    await post({
      dateISO: `${year}-06-10`, memo: "Jual tunai",
      lines: [
        { accountId: id("1110"), debitMinor: 1_000_000n, creditMinor: 0n },
        { accountId: id("4100"), debitMinor: 0n, creditMinor: 1_000_000n },
      ],
    });
    // Investasi: beli peralatan 5jt tunai
    await post({
      dateISO: `${year}-06-11`, memo: "Beli peralatan",
      lines: [
        { accountId: id("1510"), debitMinor: 5_000_000n, creditMinor: 0n },
        { accountId: id("1110"), debitMinor: 0n, creditMinor: 5_000_000n },
      ],
    });
    // Utang pendek: beban terutang 600rb (bukan persediaan — 1300 adalah
    // akun kontrol subledger, wajib via modul), bayar 250rb
    await post({
      dateISO: `${year}-06-12`, memo: "Beban terutang",
      lines: [
        { accountId: id("5200"), debitMinor: 600_000n, creditMinor: 0n },
        { accountId: id("2100"), debitMinor: 0n, creditMinor: 600_000n },
      ],
    });
    await post({
      dateISO: `${year}-06-13`, memo: "Bayar utang usaha",
      lines: [
        { accountId: id("2100"), debitMinor: 250_000n, creditMinor: 0n },
        { accountId: id("1110"), debitMinor: 0n, creditMinor: 250_000n },
      ],
    });
    // Dimuka: bayar sewa dimuka 1,2jt, amortisasi 300rb
    await post({
      dateISO: `${year}-06-14`, memo: "Bayar sewa dimuka",
      lines: [
        { accountId: id("1600"), debitMinor: 1_200_000n, creditMinor: 0n },
        { accountId: id("1110"), debitMinor: 0n, creditMinor: 1_200_000n },
      ],
    });
    await post({
      dateISO: `${year}-06-15`, memo: "Amortisasi sewa dimuka",
      lines: [
        { accountId: id("5300"), debitMinor: 300_000n, creditMinor: 0n },
        { accountId: id("1600"), debitMinor: 0n, creditMinor: 300_000n },
      ],
    });
    // Pajak: akru PPh 400rb, bayar 250rb (parsial → Δ23 neto +150rb,
    // menguji penyesuaian utang pajak nonzero)
    await post({
      dateISO: `${year}-06-16`, memo: "Akru PPh",
      lines: [
        { accountId: id("5700"), debitMinor: 400_000n, creditMinor: 0n },
        { accountId: id("2300"), debitMinor: 0n, creditMinor: 400_000n },
      ],
    });
    await post({
      dateISO: `${year}-06-17`, memo: "Bayar PPh",
      lines: [
        { accountId: id("2300"), debitMinor: 250_000n, creditMinor: 0n },
        { accountId: id("1110"), debitMinor: 0n, creditMinor: 250_000n },
      ],
    });
  });
  afterAll(async () => { await admin.end(); await truncateAll(); });

  it("arus kas tanpa plug pada fixture lengkap", async () => {
    const { db } = await import("@/server/db");
    // Helper produksi yang SAMA dipakai arus-kas/page.tsx — tanpa model
    // ulang komposisi di test.
    const { buildCashFlow } = await import("@/server/reports/cash-flow");
    const cf = await db.transaction((tx) =>
      buildCashFlow(tx as never, orgId, `${year}-06-01`, `${year}-06-30`));

    // Kas: +1jt −5jt −250rb −1,2jt −250rb = −5,7jt.
    expect(cf.deltaKasMinor).toBe(-5_700_000n);
    // Tanpa plug: kategori 21xx/23xx/57xx/16xx eksplisit menutup semua mutasi.
    expect(cf.residualMinor).toBe(0n);
    // Kas untuk pajak = Δ23 − beban 57 = +150rb − 400rb = −250rb (kas keluar).
    expect(cf.pajakMinor).toBe(-250_000n);
    expect(cf.buckets.deltaDimukaMinor).toBe(900_000n);
    expect(cf.buckets.deltaUtangUsahaMinor).toBe(350_000n);
    // Operasi: NI −300rb (1jt − 600rb − 300rb − 400rb) − Δ16 900rb
    // + Δ21 350rb + Δ23 150rb.
    expect(cf.operatingMinor).toBe(-700_000n);
  });
});
