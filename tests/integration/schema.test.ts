import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { PoolClient } from "pg";
import { getPool, makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("RLS tenant isolation", () => {
  let pool: ReturnType<typeof getPool>;
  let orgA: string, orgB: string;

  beforeAll(async () => {
    pool = getPool();
  });
  afterAll(async () => { await pool.end(); });

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

  beforeEach(async () => {
    await truncateAll();
    orgA = (await makeOrg("PT A")).orgId;
    orgB = (await makeOrg("PT B")).orgId;
  });

  it("sees only own org rows", async () => {
    const insertedA = await scoped(orgA, async (c) => {
      const r = await c.query(
        `INSERT INTO accounts (org_id, code, name, type, normal)
         VALUES ($1,'1110','Kas','ASET','D') RETURNING id`, [orgA]);
      return r.rows[0].id as string;
    });
    await scoped(orgB, async (c) => {
      await c.query(
        `INSERT INTO accounts (org_id, code, name, type, normal)
         VALUES ($1,'1110','Kas B','ASET','D')`, [orgB]);
    });

    const seenByB = await scoped(orgB, (c) => c.query("SELECT count(*)::int AS n FROM accounts"));
    expect(seenByB.rows[0].n).toBe(1); // cannot see org A's row

    const visible = await scoped(orgA, async (c) =>
      c.query("SELECT id FROM accounts WHERE id = $1", [insertedA]));
    expect(visible.rowCount).toBe(1);
  });
});
