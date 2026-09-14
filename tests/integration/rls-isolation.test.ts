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

  // RLS write-violation proof: Postgres raises 42501 with a
  // "row-level security policy" message on WITH CHECK failure. Asserting
  // BOTH rules out false positives from NOT NULL / UNIQUE / FK errors,
  // which a bare `rejects.toThrow()` would silently accept.
  async function expectRlsReject(p: Promise<unknown>): Promise<void> {
    try {
      await p;
    } catch (e) {
      const err = e as { code?: string; message?: string };
      expect(err.code).toBe("42501");
      expect(err.message ?? "").toMatch(/row-level security/i);
      return;
    }
    throw new Error("expected RLS rejection (42501), but query succeeded");
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

    const seenByB = await scoped(orgB, (c) => c.query("SELECT id, org_id FROM accounts"));
    expect(seenByB.rows).toHaveLength(1); // kontrol positif: query B berfungsi
    expect(seenByB.rows[0].org_id).toBe(orgB); // baris org A tak terlihat

    const visible = await scoped(orgA, async (c) =>
      c.query("SELECT id FROM accounts WHERE id = $1", [insertedA]),
    );
    expect(visible.rowCount).toBe(1);

    // Posting silang ditolak oleh RLS (WITH CHECK), bukan error lain:
    // own-org insert di atas adalah kontrol positif tulis (berhasil),
    // dan pesan/kode 42501 membuktikan penolakan berasal dari policy.
    await expectRlsReject(
      scoped(orgB, (c) =>
        c.query(
          `INSERT INTO accounts (org_id, code, name, type, normal)
           VALUES ($1,'1120','Kas Silang','ASET','D')`,
          [orgA],
        ),
      ),
    );
  });

  it("2. tax_summaries: select terisolasi + insert silang ditolak", async () => {
    await admin.query(
      `INSERT INTO tax_summaries (
         org_id, period_month, tax_year, gross_revenue_minor,
         cumulative_year_revenue_minor, taxable_revenue_minor, tax_due_minor, status
       ) VALUES ($1, '2026-01', 2026, 10000000000, 10000000000, 0, 0, 'UNPROCESSED')`,
      [orgA],
    );
    // Kontrol positif: org B punya barisnya sendiri, sehingga "tak terlihat"
    // di bawah benar-benar berarti terisolasi — bukan tabel kosong.
    await admin.query(
      `INSERT INTO tax_summaries (
         org_id, period_month, tax_year, gross_revenue_minor,
         cumulative_year_revenue_minor, taxable_revenue_minor, tax_due_minor, status
       ) VALUES ($1, '2026-02', 2026, 5000000000, 5000000000, 0, 0, 'UNPROCESSED')`,
      [orgB],
    );

    const rowsA = await scoped(orgA, (c) => c.query(`SELECT * FROM tax_summaries`));
    expect(rowsA.rows.length).toBe(1);
    expect(rowsA.rows.every((r) => r.org_id === orgA)).toBe(true);

    const rowsB = await scoped(orgB, (c) => c.query(`SELECT * FROM tax_summaries`));
    expect(rowsB.rows.length).toBe(1); // kontrol positif: query B berfungsi
    expect(rowsB.rows.every((r) => r.org_id === orgB)).toBe(true);
    expect(rowsB.rows.some((r) => r.org_id === orgA)).toBe(false); // baris A tak terlihat

    // Insert silang memakai SEMUA kolom NOT NULL (seperti seed valid) agar
    // satu-satunya alasan gagal adalah RLS, lalu dibuktikan via 42501.
    await expectRlsReject(
      scoped(orgB, (c) =>
        c.query(
          `INSERT INTO tax_summaries (
             org_id, period_month, tax_year, gross_revenue_minor,
             cumulative_year_revenue_minor, taxable_revenue_minor, tax_due_minor, status
           ) VALUES ($1, '2026-03', 2026, 10000000000, 10000000000, 0, 0, 'UNPROCESSED')`,
          [orgA],
        ),
      ),
    );
  });

  it("3. subledger_controls: hidden 0 / visible 1", async () => {
    const [accA] = await db
      .insert(accounts)
      .values({ orgId: orgA, code: "1310", name: "Persediaan", type: "ASET", normal: "D" })
      .returning();
    await db
      .insert(subledgerControls)
      .values({ orgId: orgA, kind: "PERSEDIAAN", controlAccountId: accA.id });
    // Kontrol positif: org B punya barisnya sendiri.
    const [accB] = await db
      .insert(accounts)
      .values({ orgId: orgB, code: "1310", name: "Persediaan B", type: "ASET", normal: "D" })
      .returning();
    await db
      .insert(subledgerControls)
      .values({ orgId: orgB, kind: "PERSEDIAAN", controlAccountId: accB.id });

    const seenAsB = await scoped(orgB, (c) => c.query(`SELECT id, org_id FROM subledger_controls`));
    expect(seenAsB.rows.length).toBe(1);
    expect(seenAsB.rows.every((r) => r.org_id === orgB)).toBe(true);
    const seenAsA = await scoped(orgA, (c) => c.query(`SELECT id, org_id FROM subledger_controls`));
    expect(seenAsA.rows.length).toBe(1);
    expect(seenAsA.rows.every((r) => r.org_id === orgA)).toBe(true);
  });

  it("4. prepaid_contracts: hidden 0 / visible 1", async () => {
    const mkAcc = async (orgId: string, code: string) => {
      const [r] = await db
        .insert(accounts)
        .values({ orgId, code, name: code, type: "ASET", normal: "D" })
        .returning();
      return r.id;
    };
    const seedContract = async (orgId: string, code: string, accSuffix: string) => {
      const c1 = await mkAcc(orgId, `160${accSuffix}`);
      const e1 = await mkAcc(orgId, `530${accSuffix}`);
      const p1 = await mkAcc(orgId, `111${accSuffix}`);
      await db.insert(prepaidContracts).values({
        orgId,
        code,
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
    };
    await seedContract(orgA, "DM-2026-0001", "A");
    // Kontrol positif: org B punya kontraknya sendiri.
    await seedContract(orgB, "DM-2026-0002", "B");

    const seenAsB = await scoped(orgB, (c) => c.query(`SELECT id, org_id, code FROM prepaid_contracts`));
    expect(seenAsB.rows).toHaveLength(1);
    expect(seenAsB.rows[0].org_id).toBe(orgB);
    expect(seenAsB.rows[0].code).toBe("DM-2026-0002");
    const seenAsA = await scoped(orgA, (c) => c.query(`SELECT id, org_id, code FROM prepaid_contracts`));
    expect(seenAsA.rows).toHaveLength(1);
    expect(seenAsA.rows[0].org_id).toBe(orgA);
    expect(seenAsA.rows[0].code).toBe("DM-2026-0001");
  });

  it("5. stock_opnames: org sendiri terlihat, org lain melihat 0", async () => {
    await admin.query(
      `INSERT INTO stock_opnames (org_id, number, opname_date)
       VALUES ($1, 'SO-2026-0001', '2026-06-18')`,
      [orgA],
    );
    // Kontrol positif: org B punya barisnya sendiri.
    await admin.query(
      `INSERT INTO stock_opnames (org_id, number, opname_date)
       VALUES ($1, 'SO-2026-0002', '2026-06-19')`,
      [orgB],
    );

    const seenAsA = await scoped(orgA, (c) =>
      c.query(`SELECT number FROM stock_opnames`),
    );
    expect(seenAsA.rows).toHaveLength(1); // kontrol positif: query A berfungsi
    expect(seenAsA.rows[0].number).toBe("SO-2026-0001"); // baris B tak terlihat
    const seenAsB = await scoped(orgB, (c) =>
      c.query(`SELECT number FROM stock_opnames`),
    );
    expect(seenAsB.rows).toHaveLength(1);
    expect(seenAsB.rows[0].number).toBe("SO-2026-0002"); // baris A tak terlihat
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

    const seenAsA = await scoped(orgA, (c) => c.query("SELECT storage_key FROM documents"));
    expect(seenAsA.rows).toHaveLength(1); // kontrol positif: query A berfungsi
    expect(seenAsA.rows[0].storage_key).toBe("orgs/a/1.pdf"); // dokumen B tak terlihat
    const seenAsB = await scoped(orgB, (c) => c.query("SELECT storage_key FROM documents"));
    expect(seenAsB.rows).toHaveLength(1);
    expect(seenAsB.rows[0].storage_key).toBe("orgs/other/x.pdf"); // dokumen A tak terlihat
  });
});
