import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool, type PoolClient } from "pg";
import { db } from "@/server/db";
import { getPool, makeOrg, truncateAll } from "./helpers";
import { accounts } from "@/server/db/schema/org";
import { subledgerControls } from "@/server/db/schema/subledger";
import { prepaidContracts } from "@/server/db/schema/prepaid";

// Suite isolasi RLS peran NOBYPASSRLS (Plan E task E1b, cabang vitest).
// Dijalankan via `bun run test:rls` dengan TEST_APP_DATABASE_URL peran
// rls_test_user. helpers.ts TIDAK diubah: getPool() memakai APP_DATABASE_URL,
// makeOrg/truncateAll memakai DATABASE_URL (owner).
// 6 kasus dipindah dari laporan E1-round-1 (daftar asli dipertahankan).
describe.skipIf(process.env.SKIP_DB_TESTS === "1")("rls isolation (NOBYPASSRLS)", () => {
  let pool: ReturnType<typeof getPool>;
  let admin: Pool;
  let orgA: string;
  let orgB: string;

  // Runs fn on the SAME checked-out client that carries app.current_org;
  // using pool.query() here would grab a different connection without the GUC.
  async function scoped<T>(orgId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      // SET cannot take bind params; set_config(..., true) === SET LOCAL.
      await c.query("SELECT set_config('app.current_org', $1, true)", [orgId]);
      const out = await fn(c);
      await c.query("COMMIT");
      return out;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }

  beforeAll(async () => {
    pool = getPool();
    admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  });
  afterAll(async () => {
    await pool.end();
    await admin.end();
  });
  beforeEach(async () => {
    await truncateAll();
    orgA = (await makeOrg("PT RLS A")).orgId;
    orgB = (await makeOrg("PT RLS B")).orgId;
  });

  it("1. accounts: org B hanya melihat barisnya + posting silang ditolak", async () => {
    const insertedA = await scoped(orgA, async (c) => {
      const r = await c.query(
        `INSERT INTO accounts (org_id, code, name, type, normal)
         VALUES ($1,'1110','Kas','ASET','D') RETURNING id`,
        [orgA],
      );
      return r.rows[0].id as string;
    });
    await scoped(orgB, async (c) => {
      await c.query(
        `INSERT INTO accounts (org_id, code, name, type, normal)
         VALUES ($1,'1110','Kas B','ASET','D')`,
        [orgB],
      );
    });

    const seenByB = await scoped(orgB, (c) => c.query("SELECT count(*)::int AS n FROM accounts"));
    expect(seenByB.rows[0].n).toBe(1); // cannot see org A's row

    const visible = await scoped(orgA, async (c) =>
      c.query("SELECT id FROM accounts WHERE id = $1", [insertedA]),
    );
    expect(visible.rowCount).toBe(1);

    // Posting silang ditolak: insert baris org A dengan konteks org B.
    await expect(
      scoped(orgB, (c) =>
        c.query(
          `INSERT INTO accounts (org_id, code, name, type, normal)
           VALUES ($1,'1120','Kas Silang','ASET','D')`,
          [orgA],
        ),
      ),
    ).rejects.toThrow();
  });

  it("2. tax_summaries: select terisolasi + insert silang ditolak", async () => {
    await admin.query(
      `INSERT INTO tax_summaries (
         org_id, period_month, tax_year, gross_revenue_minor,
         cumulative_year_revenue_minor, taxable_revenue_minor, tax_due_minor, status
       ) VALUES ($1, '2026-01', 2026, 10000000000, 10000000000, 0, 0, 'UNPROCESSED')`,
      [orgA],
    );

    const rowsA = await scoped(orgA, (c) => c.query(`SELECT * FROM tax_summaries`));
    expect(rowsA.rows.length).toBeGreaterThanOrEqual(1);
    expect(rowsA.rows.every((r) => r.org_id === orgA)).toBe(true);

    const rowsB = await scoped(orgB, (c) => c.query(`SELECT * FROM tax_summaries`));
    expect(rowsB.rows.length).toBe(0);

    await expect(
      scoped(orgB, (c) =>
        c.query(
          `INSERT INTO tax_summaries (org_id, period_month, tax_year)
           VALUES ($1, '2026-03', 2026)`,
          [orgA],
        ),
      ),
    ).rejects.toThrow();
  });

  it("3. subledger_controls: hidden 0 / visible 1", async () => {
    const [acc] = await db
      .insert(accounts)
      .values({ orgId: orgA, code: "1310", name: "Persediaan", type: "ASET", normal: "D" })
      .returning();
    await db
      .insert(subledgerControls)
      .values({ orgId: orgA, kind: "PERSEDIAAN", controlAccountId: acc.id });

    const hidden = await scoped(orgB, (c) => c.query(`SELECT id FROM subledger_controls`));
    expect(hidden.rows.length).toBe(0);
    const visible = await scoped(orgA, (c) => c.query(`SELECT id FROM subledger_controls`));
    expect(visible.rows.length).toBe(1);
  });

  it("4. prepaid_contracts: hidden 0 / visible 1", async () => {
    const mkAcc = async (code: string) => {
      const [r] = await db
        .insert(accounts)
        .values({ orgId: orgA, code, name: code, type: "ASET", normal: "D" })
        .returning();
      return r.id;
    };
    const c1 = await mkAcc("1600");
    const e1 = await mkAcc("5300");
    const p1 = await mkAcc("1110");
    await db.insert(prepaidContracts).values({
      orgId: orgA,
      code: "DM-2026-0001",
      name: "Sewa Ruko",
      controlAccountId: c1,
      expenseAccountId: e1,
      paymentAccountId: p1,
      totalMinor: 12000000n,
      startDate: "2026-01-01",
      months: 12,
      monthlyMinor: 1000000n,
      remainingMinor: 12000000n,
    });

    const hidden = await scoped(orgB, (c) => c.query(`SELECT id FROM prepaid_contracts`));
    expect(hidden.rows).toHaveLength(0);
    const visible = await scoped(orgA, (c) => c.query(`SELECT id FROM prepaid_contracts`));
    expect(visible.rows).toHaveLength(1);
  });

  it("5. stock_opnames: org sendiri terlihat, org lain melihat 0", async () => {
    await admin.query(
      `INSERT INTO stock_opnames (org_id, number, opname_date)
       VALUES ($1, 'SO-2026-0001', '2026-06-18')`,
      [orgA],
    );

    const seenOwn = await scoped(orgA, (c) =>
      c.query(`SELECT count(*)::int AS n FROM stock_opnames`),
    );
    expect(seenOwn.rows[0].n).toBe(1);
    const seenOther = await scoped(orgB, (c) =>
      c.query(`SELECT count(*)::int AS n FROM stock_opnames`),
    );
    expect(seenOther.rows[0].n).toBe(0);
  });

  it("6. documents: hanya dokumen org sendiri", async () => {
    await admin.query(
      `INSERT INTO documents (org_id, storage_key, mime, size_bytes)
       VALUES ($1, 'orgs/a/1.pdf', 'application/pdf', 10)`,
      [orgA],
    );
    await admin.query(
      `INSERT INTO documents (org_id, storage_key, mime, size_bytes)
       VALUES ($1, 'orgs/other/x.pdf', 'application/pdf', 1)`,
      [orgB],
    );

    const seen = await scoped(orgA, (c) => c.query("SELECT count(*)::int AS n FROM documents"));
    expect(seen.rows[0].n).toBe(1); // hanya dokumen org A, bukan milik org B
  });
});
