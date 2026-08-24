import { describe, it, expect, afterAll } from "vitest";
import { Pool } from "pg";
import "dotenv/config";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("m2 hardening constraints", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  afterAll(async () => { await admin.end(); });

  async function failsWith(sql: string): Promise<string | null> {
    try { await admin.query(sql); return null; }
    catch (e) { return (e as Error).message; }
  }

  it("has the indexes", async () => {
    const r = await admin.query(
      `SELECT indexname FROM pg_indexes
       WHERE indexname IN ('journal_lines_entry_id_idx','je_reversal_once_uq')`);
    expect(r.rowCount).toBe(2);
  });

  it("rejects bad status/source/role literals", async () => {
    expect(await failsWith(
      `INSERT INTO journal_entries (org_id, period_id, seq, number, entry_date, memo, status)
       VALUES ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000',1,'X','2026-01-01','x','posted')`,
    )).toMatch(/je_status_chk/i);
    expect(await failsWith(
      `INSERT INTO fiscal_periods (org_id, name, starts_on, ends_on, status)
       VALUES ('00000000-0000-0000-0000-000000000000','1999-01','1999-01-01','1999-01-31','open')`,
    )).toMatch(/period_status_chk/i);
    expect(await failsWith(
      `INSERT INTO memberships (org_id, user_id, role)
       VALUES ('00000000-0000-0000-0000-000000000000','x','admin')`,
    )).toMatch(/member_role_chk/i);
  });

  it("rejects a second reversal of the same entry", async () => {
    const org = await admin.query(
      `INSERT INTO organizations (name) VALUES ('Hardening Uji') RETURNING id`);
    const orgId = org.rows[0].id;
    const period = await admin.query(
      `INSERT INTO fiscal_periods (org_id, name, starts_on, ends_on, status)
       VALUES ($1,'2000-01','2000-01-01','2000-01-31','OPEN') RETURNING id`, [orgId]);
    const acc = await admin.query(
      `INSERT INTO accounts (org_id, code, name, type, normal)
       VALUES ($1,'1110','Kas','ASET','D') RETURNING id`, [orgId]);
    const accId = acc.rows[0].id;
    const je = async (number: string, reversalOf: string | null) => {
      // Legal path: insert as DRAFT, add lines, then flip to POSTED
      // (jl_immutable trigger forbids line inserts on POSTED entries).
      const r = await admin.query(
        `INSERT INTO journal_entries (org_id, period_id, seq, number, entry_date, memo, status, reversal_of_id)
         VALUES ($1,$2,1,$3,'2000-01-01','x','DRAFT',$4) RETURNING id`,
        [orgId, period.rows[0].id, number, reversalOf]);
      await admin.query(
        `INSERT INTO journal_lines (org_id, entry_id, account_id, position, debit, credit)
         VALUES ($1,$2,$3,0,100,0)`, [orgId, r.rows[0].id, accId]);
      await admin.query(
        `INSERT INTO journal_lines (org_id, entry_id, account_id, position, debit, credit)
         VALUES ($1,$2,$3,1,0,100)`, [orgId, r.rows[0].id, accId]);
      await admin.query(`UPDATE journal_entries SET status='POSTED' WHERE id=$1`, [r.rows[0].id]);
      return r.rows[0].id as string;
    };
    const original = await je("JE-2000-0001", null);
    await je("JE-2000-0002", original);
    await expect(je("JE-2000-0003", original)).rejects.toThrow(/je_reversal_once_uq/i);
  });
});
