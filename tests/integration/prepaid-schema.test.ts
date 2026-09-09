import { describe, expect, it, beforeEach } from "vitest";
import type { PoolClient } from "pg";
import { db } from "@/server/db";
import { getPool, truncateAll, makeOrg } from "./helpers";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import { journalEntries } from "@/server/db/schema/journal";
import { prepaidContracts } from "@/server/db/schema/prepaid";

describe("skema prepaid", () => {
  beforeEach(async () => { await truncateAll(); });

  it("tabel tersedia dan RLS mengisolasi antar org", async () => {
    const a = await makeOrg("org-a");
    const b = await makeOrg("org-b");
    const mkAcc = async (orgId: string, code: string) => {
      const [r] = await db.insert(accounts).values({
        orgId, code, name: code, type: "ASET", normal: "D",
      }).returning();
      return r.id;
    };
    const c1 = await mkAcc(a.orgId, "1600");
    const e1 = await mkAcc(a.orgId, "5300");
    const p1 = await mkAcc(a.orgId, "1110");
    await db.insert(prepaidContracts).values({
      orgId: a.orgId, code: "DM-2026-0001", name: "Sewa Ruko",
      controlAccountId: c1, expenseAccountId: e1, paymentAccountId: p1,
      totalMinor: 12000000n, startDate: "2026-01-01", months: 12,
      monthlyMinor: 1000000n, remainingMinor: 12000000n,
    });

    // Pola scoped seperti subledger-schema.test.ts: BEGIN + SET LOCAL di satu koneksi.
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
    const hidden = await scoped(b.orgId, (c) => c.query(`SELECT id FROM prepaid_contracts`));
    expect(hidden.rows).toHaveLength(0);
    const visible = await scoped(a.orgId, (c) => c.query(`SELECT id FROM prepaid_contracts`));
    expect(visible.rows).toHaveLength(1);
    await pool.end();
  });

  it("CHECK je_source_chk menerima DIMUKA", async () => {
    const { orgId } = await makeOrg("org-src");
    const [per] = await db.insert(fiscalPeriods).values({
      orgId, name: "2026-01", startsOn: "2026-01-01", endsOn: "2026-01-31", status: "OPEN",
    }).returning();
    const [je] = await db.insert(journalEntries).values({
      orgId, periodId: per.id, seq: 1, number: "JE-2026-0001",
      entryDate: "2026-01-05", memo: "cek", source: "DIMUKA", status: "DRAFT",
    }).returning();
    expect(je.id).toBeTruthy();
  });
});
