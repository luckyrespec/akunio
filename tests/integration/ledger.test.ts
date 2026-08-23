import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("ledger drilldown", () => {
  let orgId: string;
  let kas = "", bank = "", pendapatan = "", utang = "";
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Buku Besar")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    kas = byCode["1110"]; bank = byCode["1120"];
    pendapatan = byCode["4100"]; utang = byCode["2100"];
  });
  afterAll(async () => { await admin.end(); await truncateAll(); });

  async function post(input: object) {
    const { postJournalEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    return db.transaction((tx) =>
      postJournalEntry(tx as never, orgId, "tester@test.id", input as never));
  }

  async function getLedgerFor(accountId: string) {
    const { getLedger } = await import("@/server/db/repos/ledger.repo");
    const { db } = await import("@/server/db");
    return db.transaction((tx) => getLedger(tx as never, orgId, accountId));
  }

  const year = new Date().getFullYear();

  it("builds chronological running balance signed by normal side", async () => {
    // Kas (debit-normal): +2.000.000 then -500.000
    await post({
      dateISO: `${year}-01-10`, memo: "Setoran awal",
      lines: [
        { accountId: kas, debitMinor: 2_000_000n, creditMinor: 0n },
        { accountId: pendapatan, debitMinor: 0n, creditMinor: 2_000_000n },
      ],
    });
    await post({
      dateISO: `${year}-01-15`, memo: "Bayar utang",
      lines: [
        { accountId: utang, debitMinor: 500_000n, creditMinor: 0n },
        { accountId: kas, debitMinor: 0n, creditMinor: 500_000n },
      ],
    });

    const ledger = await getLedgerFor(kas);
    expect(ledger.account.code).toBe("1110");
    expect(ledger.rows).toHaveLength(2);
    expect(ledger.rows[0].balanceMinor).toBe(2_000_000n);
    expect(ledger.rows[1].balanceMinor).toBe(1_500_000n);

    // Utang Usaha (credit-normal): debit decreases saldo → negative
    const utangLedger = await getLedgerFor(utang);
    expect(utangLedger.account.normal).toBe("K");
    expect(utangLedger.rows).toHaveLength(1);
    expect(utangLedger.rows[0].balanceMinor).toBe(-500_000n);

    // Pendapatan (credit-normal): credit increases saldo
    const pnl = await getLedgerFor(pendapatan);
    expect(pnl.rows).toHaveLength(1);
    expect(pnl.rows[0].balanceMinor).toBe(2_000_000n);

    // Empty account yields zero rows
    const bankLedger = await getLedgerFor(bank);
    expect(bankLedger.rows).toHaveLength(0);
  });

  it("includes only POSTED entries ordered chronologically", async () => {
    await admin.query(
      `INSERT INTO journal_entries (org_id, period_id, seq, number, entry_date, memo, status)
       SELECT $1, p.id, 99, 'JE-DRAFT-X', $3, 'draft tak terposting', 'DRAFT'
       FROM fiscal_periods p WHERE p.org_id=$1 AND p.name=$2`,
      [orgId, `${year}-01`, `${year}-01-01`],
    );
    const draft = await admin.query<{ id: string }>(
      `SELECT id FROM journal_entries WHERE org_id=$1 AND number='JE-DRAFT-X'`, [orgId]);
    await admin.query(
      `INSERT INTO journal_lines (org_id, entry_id, account_id, position, debit, credit)
       VALUES ($1, $2, $3, 0, '123.00', '0')`,
      [orgId, draft.rows[0].id, kas],
    );

    const ledger = await getLedgerFor(kas);
    expect(ledger.rows.every((r) => r.number !== "JE-DRAFT-X")).toBe(true);
    const dates = ledger.rows.map((r) => r.entryDate);
    expect(dates).toEqual([...dates].sort());
  });

  it("throws AKUN_TIDAK_DITEMUKAN for unknown account", async () => {
    await expect(getLedgerFor(crypto.randomUUID())).rejects.toThrow("AKUN_TIDAK_DITEMUKAN");
  });
});
