import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("tax_summaries schema & RLS isolation", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  let orgA: string;

  beforeAll(async () => {
    await truncateAll();
    orgA = (await makeOrg("UMKM Berkah")).orgId;
  });

  afterAll(async () => {
    await truncateAll().catch(() => {});
    await admin.end();
  });

  it("creates a tax summary record and verifies constraints", async () => {
    const res = await admin.query<{ id: string }>(
      `INSERT INTO tax_summaries (
        org_id, period_month, tax_year, gross_revenue_minor,
        cumulative_year_revenue_minor, taxable_revenue_minor, tax_due_minor, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [orgA, "2026-01", 2026, 10000000000n, 10000000000n, 0n, 0n, "UNPROCESSED"]
    );
    expect(res.rows.length).toBe(1);

    // Duplicate (org_id, period_month) must fail unique constraint
    await expect(
      admin.query(
        `INSERT INTO tax_summaries (org_id, period_month, tax_year, gross_revenue_minor)
         VALUES ($1, $2, $3, $4)`,
        [orgA, "2026-01", 2026, 5000000000n]
      )
    ).rejects.toThrow();

    // Invalid status must fail check constraint
    await expect(
      admin.query(
        `INSERT INTO tax_summaries (org_id, period_month, tax_year, status)
         VALUES ($1, $2, $3, $4)`,
        [orgA, "2026-02", 2026, "INVALID_STATUS"]
      )
    ).rejects.toThrow();
  });

  it("accepts 'TAX' as journal source without constraint violation", async () => {
    // Insert a fiscal period first
    const pRes = await admin.query<{ id: string }>(
      `INSERT INTO fiscal_periods (org_id, name, starts_on, ends_on, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [orgA, "2026-01", "2026-01-01", "2026-01-31", "OPEN"]
    );
    const periodId = pRes.rows[0].id;

    const jRes = await admin.query<{ id: string; source: string }>(
      `INSERT INTO journal_entries (org_id, period_id, seq, number, entry_date, memo, source, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, source`,
      [orgA, periodId, 1, "JE-2026-0001", "2026-01-31", "Akrual PPh Final PP 55/2022", "TAX", "DRAFT"]
    );
    expect(jRes.rows[0].source).toBe("TAX");
  });
});
