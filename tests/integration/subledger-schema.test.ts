import { describe, it, expect, beforeEach } from "vitest";
import type { PoolClient } from "pg";
import { db } from "@/server/db";
import { getPool, truncateAll, makeOrg } from "./helpers";
import { accounts } from "@/server/db/schema/org";
import { subledgerControls, subledgerJournalLinks } from "@/server/db/schema/subledger";

describe("skema subledger", () => {
  beforeEach(async () => { await truncateAll(); });

  it("tabel ada dan RLS mengisolasi per org", async () => {
    const a = await makeOrg("rls-a");
    const b = await makeOrg("rls-b");
    const [acc] = await db.insert(accounts).values({
      orgId: a.orgId, code: "1310", name: "Persediaan", type: "ASET", normal: "D",
    }).returning();
    await db.insert(subledgerControls).values({ orgId: a.orgId, kind: "PERSEDIAAN", controlAccountId: acc.id });

    // Pola scoped seperti tests/integration/schema.test.ts: BEGIN + SET LOCAL
    // di koneksi yang sama (autocommit membuang set_config transaction-local).
    const pool = getPool();
    async function scoped<T>(orgId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
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

    const hidden = await scoped(b.orgId, (c) => c.query(`SELECT id FROM subledger_controls`));
    expect(hidden.rows.length).toBe(0);
    const visible = await scoped(a.orgId, (c) => c.query(`SELECT id FROM subledger_controls`));
    expect(visible.rows.length).toBe(1);
    await expect(db.select().from(subledgerJournalLinks)).resolves.toEqual([]);
    await pool.end();
  });
});
