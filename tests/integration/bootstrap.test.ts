import "dotenv/config";
import { describe, it, expect, afterAll } from "vitest";
import { Pool } from "pg";
import { truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("org bootstrap on signup", () => {
  // admin conn: auth hooks run outside RLS scope
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  afterAll(async () => {
    await pool.end();
    await truncateAll();
  });

  it("creates org + owner membership + coa + 12 periods", async () => {
    const { auth } = await import("@/server/auth/auth-server");
    const res = await auth.api.signUpEmail({
      body: {
        email: `u${Date.now()}@test.id`,
        password: "rahasia123",
        name: "PT Uji",
      },
    });
    expect(res.user).toBeDefined();

    const orgRow = await pool.query<{ org_id: string }>(
      `SELECT m.org_id FROM memberships m WHERE m.user_id = $1 AND m.role = 'OWNER'`,
      [res.user!.id],
    );
    expect(orgRow.rowCount).toBe(1);
    const orgId = orgRow.rows[0].org_id;

    const accs = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM accounts WHERE org_id=$1",
      [orgId],
    );
    expect(accs.rows[0].n).toBeGreaterThanOrEqual(31);

    const periods = await pool.query<{ n: number; statuses: number }>(
      "SELECT count(*)::int AS n, count(DISTINCT status)::int AS statuses FROM fiscal_periods WHERE org_id=$1",
      [orgId],
    );
    expect(periods.rows[0].n).toBe(12);
    expect(periods.rows[0].statuses).toBe(1); // all OPEN

    // seeding is idempotent
    const { seedOrgData } = await import("@/server/bootstrap/seed-org");
    await expect(seedOrgData(orgId)).resolves.toBeUndefined();
    const accs2 = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM accounts WHERE org_id=$1",
      [orgId],
    );
    expect(accs2.rows[0].n).toBe(accs.rows[0].n);
  });
});
